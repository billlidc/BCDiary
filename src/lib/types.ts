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
