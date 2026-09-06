-- Persistent memory for the admin AI assistant (see app/admin_ai/models.py
-- AdminAIMemory). Unlike the Redis-backed chat session (1-hour TTL, wiped
-- on restart), rows here survive forever until explicitly deleted — this
-- is what lets the assistant "learn" a user's preferences across sessions
-- instead of forgetting everything an hour after the tab closes.

CREATE TABLE IF NOT EXISTS admin_ai_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_admin_ai_memories_user ON admin_ai_memories (user_id);
