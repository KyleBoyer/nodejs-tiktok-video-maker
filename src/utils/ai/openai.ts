/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import OpenAI from 'openai';
import * as tiktoken from 'tiktoken';
import { validateConfig } from '../config';
import * as splitter from '../splitter';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const numTokensFromString = ( str: string, model: string): number => {
  const encoder = tiktoken.encoding_for_model(model as tiktoken.TiktokenModel);
  const numTokens = encoder.encode(str).length;
  encoder.free();
  return numTokens;
};

const removeAIExtras = (str: string) => {
  const lines = str.split(/\n/);
  const firstLine = lines[0].toLowerCase().trim();
  if (firstLine.includes('here') && firstLine.endsWith('story:')) {
    return lines.slice(1).join('\n');
  }
  return str;
};

const isValidAIResponse = (str: string) => {
  const lowerStr = str.toLowerCase();
  return !(
    lowerStr.startsWith('i can\'t') ||
    lowerStr.startsWith('i cannot') ||
    lowerStr.startsWith('i can not') ||
    lowerStr.startsWith('sorry') ||
    lowerStr.startsWith('i\'m sorry') ||
    lowerStr.startsWith('i am sorry') ||
    lowerStr.startsWith('i apologize')
  ) && lowerStr.length > 150;
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
    const MAX_RETRIES = this.config.story.openai_rewrite_retries;
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

    // TODO
    return originalStory;
  }
  async generateNewStory(): Promise<{
    content: string
    title: string
  }> {
    const prompt = this.config.story.prompt;
    // TODO
    return {
      title: 'Not implemented',
      content: 'This function is not implemented yet',
    };
  }
}

