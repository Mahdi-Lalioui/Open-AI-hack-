/** `npm start`: serves the production build. Sets NODE_ENV here so it works on Windows shells too. */
process.env.NODE_ENV = 'production';
await import('../server/index');

export {};
