/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import OpenAI from 'openai';
import * as tiktoken from 'tiktoken';
import { validateConfig } from '../config';
import * as splitter from '../splitter';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// sources
// https://platform.openai.com/docs/deprecations/
// https://openai.com/pricing
// https://platform.openai.com/docs/models/continuous-model-upgrades

// tokens
const _4k = 4 * 1024;
const _8k = 8 * 1024;
const _16k = 16 * 1024;
const _32k = 32 * 1024;
const _128k = 128 * 1024;

const models: Record<string, number> = {
  // gpt 4
  'gpt-4': _8k,
  'gpt-4-0613': _8k,
  'gpt-4-32k': _32k,
  'gpt-4-32k-0613': _32k,
  'gpt-4-1106-preview': _128k,
  'gpt-4-vision-preview': _128k,

  // gpt 3
  'gpt-3.5-turbo-1106': _16k,
  'gpt-3.5-turbo': _4k,
  'gpt-3.5-turbo-16k': _16k,
  'gpt-3.5-turbo-instruct': _4k,
  'gpt-3.5-turbo-0613': _4k,
  'gpt-3.5-turbo-16k-0613': _16k,

  // embeddings
  'text-embedding-ada-002': _8k,

  // legacy
  'text-davinci-003': _4k,
  'text-davinci-002': _4k,
  'code-davinci-002': 8001,
};

const numTokensFromString = ( str: string, model: string): number => {
  const encoder = tiktoken.encoding_for_model(model as tiktoken.TiktokenModel);
  const numTokens = encoder.encode(str).length;
  encoder.free();
  return numTokens;
};

const removeAIExtras = (str: string) => {
  const lines = str.split(/\n/);
  const firstLine = lines[0].toLowerCase().trim();
  if (firstLine.includes('here') && firstLine.endsWith('story:') || firstLine.endsWith('title:')) {
    return lines.slice(1).join('\n');
  }
  return str;
};

const isValidAIResponse = (str: string, minLength = 150) => {
  const lowerStr = str.toLowerCase();
  return !(
    lowerStr.startsWith('i can\'t') ||
    lowerStr.startsWith('i cannot') ||
    lowerStr.startsWith('i can not') ||
    lowerStr.startsWith('sorry') ||
    lowerStr.startsWith('i\'m sorry') ||
    lowerStr.startsWith('i am sorry') ||
    lowerStr.startsWith('i apologize')
  ) && lowerStr.length > minLength;
};

export class OpenAIUtil {
  config: ReturnType<typeof validateConfig>;
  openai: OpenAI;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.story.openai_api_key,
      baseURL: config.story.openai_api_base,
    });
  }

  async rewordStory(originalStory: string): Promise<string> {
    const MAX_RETRIES = this.config.story.openai_retries;
    const MAX_PART_REWORD_TOKENS = this.config.story.openai_rewrite_chunk_max_tokens;
    const rewriteLength = this.config.story.openai_rewrite_length;
    const longerOrShorter = rewriteLength >= 1.0 ? 'longer' : 'shorter';
    const modelName = this.config.story.openai_model;
    const aiSystemMessage = `The user will present you with a story. You must rewrite the story in first person. Rewrite the story to the same or ${longerOrShorter} length, keeping the same details, but make it extremely addictive to listen to, with many cliffhangers. Use language and words that the average social media user can understand. Avoid using swear words and words that may not be allowed, like: gun, drug, shoot, kill, suicide, etc.`;
    const aiUserMessage = 'Rewrite this story to be more addictive. Your output will be published, so make sure to only output the new story.';
    const aiAssistantMessage = 'Sure! What is the story?';
    const baseTokens = numTokensFromString(aiSystemMessage+aiUserMessage+aiAssistantMessage, modelName);
    const parts = await splitter.split(originalStory, this.config.captions.nlp_splitter);
    const partsSplitByTokens=[];
    while (parts.length > 0) {
      const tmpPartList=[];
      let tmpTokens = baseTokens;
      while (tmpTokens < MAX_PART_REWORD_TOKENS && parts.length > 0) {
        const nextPart = parts.shift();
        tmpTokens+=numTokensFromString(nextPart, modelName);
        tmpPartList.push(nextPart);
      }
      if (tmpPartList.length > 0) {
        partsSplitByTokens.push(tmpPartList);
      }
    }
    const rewrittenParts=[];
    for (const partList of partsSplitByTokens) {
      const joinedPartList = partList.join(' ');
      const partChatHistory: Array<ChatCompletionMessageParam> = [
        {'role': 'system', 'content': aiSystemMessage},
        {'role': 'user', 'content': aiUserMessage},
        {'role': 'assistant', 'content': aiAssistantMessage},
        {'role': 'user', 'content': joinedPartList},
      ];
      const joinedPartListTokens = numTokensFromString(joinedPartList, modelName) * rewriteLength;
      let aiPartMessage='';
      let partRetryNum=0;
      while (partRetryNum <= MAX_RETRIES && numTokensFromString(aiPartMessage, modelName) < joinedPartListTokens) {
        try {
          const aiPartResponse = await this.openai.chat.completions.create({
            model: modelName,
            messages: partChatHistory,
            temperature: 0.9, // very creative
          });
          const aiPartMessageUpdated = removeAIExtras(aiPartResponse.choices[0].message.content);
          const oldPartTokens = numTokensFromString(aiPartMessage, modelName);
          const newPartTokens = numTokensFromString(aiPartMessageUpdated, modelName);
          if (newPartTokens > oldPartTokens && isValidAIResponse(aiPartMessageUpdated)) {
            aiPartMessage = aiPartMessageUpdated;
            partChatHistory.push({'role': 'assistant', 'content': aiPartMessage});
            partChatHistory.push({'role': 'user', 'content': 'Make the story longer/more detailed'});
          }
        } catch (err) {
          console.error(err);
        }
        partRetryNum+=1;
      }
      if (!aiPartMessage) {
        if (this.config.story.openai_rewrite_retry_fail_on_error) {
          throw new Error('AI rewrite failed');
        } else {
          aiPartMessage = joinedPartList;
        }
      }
      rewrittenParts.push(aiPartMessage);
      // Finalize story
      const joinedRewrittenParts = rewrittenParts.join(' ');
      const chatHistory: Array<ChatCompletionMessageParam> = [
        {'role': 'system', 'content': 'The user will present you with a story. You must output the same story with any issues fixed, and possibly expand the story to be longer. Your goal is to output a story that can be read to an audience. This story must make sense and have a lot of cliffhangers, to keep the audience interested. Keep the same story details and possibly add more. Avoid using swear words and words that may not be allowed, like: gun, drug, shoot, kill, suicide, etc. Make your story about 5 minutes in spoken length.'},
        {'role': 'user', 'content': 'I have a story for you to review. Your output will be published, so make sure to only output the story. Do NOT include any extra information in your response besides the story.'},
        {'role': 'assistant', 'content': aiAssistantMessage},
        {'role': 'user', 'content': joinedRewrittenParts},
      ];
      const joinedRewrittenPartsTokens = numTokensFromString(joinedRewrittenParts, modelName);
      let aiMessage='';
      let retryNum = 0;
      while (retryNum <= MAX_RETRIES && numTokensFromString(aiMessage, modelName) < joinedRewrittenPartsTokens) {
        try {
          const aiResponse = await this.openai.chat.completions.create({
            model: modelName,
            messages: chatHistory,
            temperature: 0.9, // very creative
          });
          const aiMessageUpdated = removeAIExtras(aiResponse.choices[0].message.content);
          const oldTokens = numTokensFromString(aiMessage, modelName);
          const newTokens = numTokensFromString(aiMessageUpdated, modelName);
          if (newTokens > oldTokens && isValidAIResponse(aiMessageUpdated)) {
            aiMessage = aiMessageUpdated;
            chatHistory.push({'role': 'assistant', 'content': aiMessage});
            chatHistory.push({'role': 'user', 'content': 'Make the story longer/more detailed'});
          }
        } catch (err) {
          console.error(err);
        }
        retryNum+=1;
      }
      return aiMessage ? aiMessage : joinedRewrittenParts;
    }
    return originalStory;
  }
  async generateNewStory(): Promise<{
    content: string
    title: string
  }> {
    const prompt = this.config.story.openai_new_story_prompt;
    const MAX_RETRIES = this.config.story.openai_retries;
    const modelName = this.config.story.openai_model;
    const desiredLength = this.config.story.openai_new_story_desired_length;
    const minLength = this.config.story.openai_new_story_min_length;
    // ~4char = 1token
    const MODEL_MAX_TOKENS = models[this.config.story.openai_model] || 4096;
    if ((desiredLength/4) > (MODEL_MAX_TOKENS/2)) {
      console.warn('The openai_desired_length config is too large in comparison to the openai_model.');
    }
    const createStoryChatHistory: Array<ChatCompletionMessageParam> = [
      {'role': 'system', 'content': 'The user will present you with an idea for a story. You must create a story for that idea. Your goal is to output a story that can be read to an audience. Make sure the first sentence is very attention grabbing, as most viewers lose interest after 10 seconds. This story must make sense and have a lot of cliffhangers, to keep the audience interested. Avoid using swear words and words that may not be allowed, like: gun, drug, shoot, kill, suicide, etc. Make your story about ' + desiredLength + ' characters long.'},
      {'role': 'user', 'content': 'I have a story idea for you to write. Your output will be published, so make sure to only output the story. Do NOT include any extra information in your response besides the story.'},
      {'role': 'assistant', 'content': 'Sure! What is the story idea?'},
      {'role': 'user', 'content': prompt},
    ];
    let createStoryAIMessage='';
    let createStoryRetryNum = 0;
    while (createStoryRetryNum <= MAX_RETRIES && createStoryAIMessage.length < desiredLength) {
      try {
        const aiResponse = await this.openai.chat.completions.create({
          model: modelName,
          messages: createStoryChatHistory,
          temperature: 0.9, // very creative
        });
        const createStoryAIMessageUpdated = removeAIExtras(aiResponse.choices[0].message.content);
        const oldLength = createStoryAIMessage.length;
        const newLength = createStoryAIMessageUpdated.length;
        if (newLength > oldLength && isValidAIResponse(createStoryAIMessageUpdated)) {
          createStoryAIMessage = createStoryAIMessageUpdated;
          createStoryChatHistory.push({'role': 'assistant', 'content': createStoryAIMessage});
          createStoryChatHistory.push({'role': 'user', 'content': 'Make the story longer/more detailed'});
        }
      } catch (err) {
        console.error(err);
      }
      createStoryRetryNum+=1;
    }
    if (!createStoryAIMessage) {
      throw new Error('OpenAI failed to create a story!');
    } else if (createStoryAIMessage.length < minLength) {
      throw new Error(`OpenAI failed to generate a story, that had at minimum ${minLength} characters!`);
    }

    const titleStoryChatHistory: Array<ChatCompletionMessageParam> = [
      {'role': 'system', 'content': 'The user will present you with an a story. You must create an attention grabbing title for that story. Your goal is to output a title that can be read to an audience. Make sure the title is very attention grabbing, as most viewers lose interest after 10 seconds. This title should get the audience interested. Avoid using swear words and words that may not be allowed, like: gun, drug, shoot, kill, suicide, etc.'},
      {'role': 'user', 'content': 'I have a story for you to title. Your output will be published, so make sure to only output the title. Do NOT include any extra information in your response besides the title.'},
      {'role': 'assistant', 'content': 'Sure! What is the story?'},
      {'role': 'user', 'content': createStoryAIMessage},
    ];
    let titleStoryAIMessage='';
    let titleStoryRetryNum = 0;
    while (titleStoryRetryNum <= MAX_RETRIES && titleStoryAIMessage.length < 5) {
      try {
        const aiResponse = await this.openai.chat.completions.create({
          model: modelName,
          messages: titleStoryChatHistory,
          temperature: 0.9, // very creative
        });
        const titleStoryAIMessageUpdated = removeAIExtras(aiResponse.choices[0].message.content);
        const oldLength = titleStoryAIMessage.length;
        const newLength = titleStoryAIMessageUpdated.length;
        if (newLength > oldLength && isValidAIResponse(titleStoryAIMessageUpdated, 5)) {
          titleStoryAIMessage = titleStoryAIMessageUpdated;
          createStoryChatHistory.push({'role': 'assistant', 'content': titleStoryAIMessage});
          createStoryChatHistory.push({'role': 'user', 'content': 'Make the title longer'});
        }
      } catch (err) {
        console.error(err);
      }
      titleStoryRetryNum+=1;
    }
    return {
      title: titleStoryAIMessage,
      content: createStoryAIMessage,
    };
  }
}

