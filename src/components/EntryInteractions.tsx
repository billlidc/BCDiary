"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Comment } from "@/lib/types";

type EntryInteractionsProps = {
  entryId: string;
  userId: string;
  displayName: string;
};

function formatCommentTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EntryInteractions({
  entryId,
  userId,
  displayName,
}: EntryInteractionsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) ?? []);
  }, [entryId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentInput.trim()) return;

    try {
      setSavingComment(true);
      const { error } = await supabase.from("comments").insert({
        entry_id: entryId,
        user_id: userId,
        author_name: displayName,
        content: commentInput.trim(),
      });
      if (error) throw error;
      setCommentInput("");
      await loadComments();
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        className="btn btn-soft"
        onClick={() => setShowComments((current) => !current)}
      >
        {showComments ? "Hide comments" : "Comments"}{" "}
        {comments.length > 0 ? `(${comments.length})` : ""}
      </button>

      {showComments ? (
        <div className="space-y-3">
          {comments.length > 0 ? (
            <ul className="space-y-2">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="diary-content-text text-sm text-zinc-700"
                >
                  <span className="font-semibold text-zinc-800">
                    {comment.author_name}
                  </span>{" "}
                  <span className="text-[10px] text-zinc-400">
                    {formatCommentTime(comment.created_at)}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-zinc-500">
              No comments yet. Be the first!
            </p>
          )}

          <form onSubmit={addComment} className="flex gap-2">
            <input
              className="input diary-content-text flex-1"
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
              placeholder="Leave a note..."
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingComment || !commentInput.trim()}
            >
              {savingComment ? "..." : "Send"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
