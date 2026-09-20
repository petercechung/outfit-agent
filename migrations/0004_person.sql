-- What the agents knew about the person on each request (src/person.ts), and the memory the stylist rewrote.
ALTER TABLE requests ADD COLUMN person TEXT;
ALTER TABLE requests ADD COLUMN memory_update TEXT;
ALTER TABLE analyses ADD COLUMN person TEXT;
