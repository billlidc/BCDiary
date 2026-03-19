export type Entry = {
  id: string;
  title: string;
  content: string;
  memory_date: string;
  created_at: string;
  updated_at?: string;
  author_id: string;
  author_name: string;
};

export type Profile = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export const EMOJI_OPTIONS = [
  { key: "heart", label: "❤️" },
  { key: "smile", label: "😊" },
  { key: "laugh", label: "😂" },
  { key: "cry", label: "😢" },
  { key: "love", label: "🥰" },
] as const;

export type EmojiKey = (typeof EMOJI_OPTIONS)[number]["key"];

export type Reaction = {
  id: string;
  entry_id: string;
  user_id: string;
  emoji: EmojiKey;
  created_at: string;
};

export type Comment = {
  id: string;
  entry_id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
};
