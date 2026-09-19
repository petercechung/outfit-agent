-- Which language model answered (the page lets testers switch; src/config.ts MODELS).
ALTER TABLE requests ADD COLUMN model TEXT;
