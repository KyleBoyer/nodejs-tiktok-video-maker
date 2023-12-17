import express from 'express';
export const app = express();

// TODO: Add GUI routes

app.all(['/', '/*'], (_req, res) => {
  res.status(200).end('Hello world!');
});
