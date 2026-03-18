"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { displayNameFromEmail, isAllowedEmail } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import type { Entry } from "@/lib/types";
import { LoginScreen } from "./LoginScreen";

function formatPrettyDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function hasBeenEdited(entry: Entry): boolean {
  if (!entry.updated_at) return false;
  return (
    new Date(entry.updated_at).getTime() -
      new Date(entry.created_at).getTime() >
    1000
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function DiaryApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [memoryDate, setMemoryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editMemoryDate, setEditMemoryDate] = useState("");
  const [jumpDate, setJumpDate] = useState("");
  const addMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const userEmail = session?.user?.email ?? null;
  const blockedUser = session && !isAllowedEmail(userEmail);

  async function loadEntries() {
    setLoadingEntries(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("entries")
      .select("*")
      .order("memory_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingEntries(false);
      return;
    }

    setEntries((data as Entry[]) ?? []);
    setLoadingEntries(false);
  }

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user?.id) return;
    if (!title.trim() || !content.trim()) return;

    try {
      setSavingEntry(true);
      setError(null);

      const { error: insertError } = await supabase.from("entries").insert({
        title: title.trim(),
        content: content.trim(),
        memory_date: memoryDate,
        author_id: session.user.id,
        author_name: displayNameFromEmail(userEmail),
      });

      if (insertError) throw insertError;

      setTitle("");
      setContent("");
      setMemoryDate(new Date().toISOString().slice(0, 10));
      setShowAddMemory(false);
      await loadEntries();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save memory.";
      setError(message);
    } finally {
      setSavingEntry(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setEntries([]);
    setShowAddMemory(false);
  }

  function startEdit(entry: Entry) {
    setEditingEntryId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditMemoryDate(entry.memory_date);
    setError(null);
  }

  function cancelEdit() {
    setEditingEntryId(null);
    setEditTitle("");
    setEditContent("");
    setEditMemoryDate("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, entryId: string) {
    event.preventDefault();
    if (!session?.user?.id) return;
    if (!editTitle.trim() || !editContent.trim() || !editMemoryDate) return;

    try {
      setSavingEdit(true);
      setError(null);

      const { error: updateError } = await supabase
        .from("entries")
        .update({
          title: editTitle.trim(),
          content: editContent.trim(),
          memory_date: editMemoryDate,
        })
        .eq("id", entryId)
        .eq("author_id", session.user.id);

      if (updateError) throw updateError;

      cancelEdit();
      await loadEntries();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to update memory.";
      setError(message);
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);

      if (nextSession && isAllowedEmail(nextSession.user.email)) {
        loadEntries();
      } else {
        setLoadingEntries(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession && isAllowedEmail(nextSession.user.email)) {
        loadEntries();
      } else {
        setEntries([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (addMemoryTextareaRef.current) {
      autoResizeTextarea(addMemoryTextareaRef.current);
    }
  }, [content, showAddMemory]);

  useEffect(() => {
    if (editMemoryTextareaRef.current) {
      autoResizeTextarea(editMemoryTextareaRef.current);
    }
  }, [editContent, editingEntryId]);

  const welcomeName = useMemo(
    () => displayNameFromEmail(userEmail),
    [userEmail],
  );
  const firstEntryIdByDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of entries) {
      if (!map[entry.memory_date]) {
        map[entry.memory_date] = entry.id;
      }
    }
    return map;
  }, [entries]);

  const timelineDates = useMemo(
    () => Object.keys(firstEntryIdByDate).sort((a, b) => b.localeCompare(a)),
    [firstEntryIdByDate],
  );

  function jumpToDate(dateValue: string) {
    const targetId = firstEntryIdByDate[dateValue];
    if (!targetId) return;
    const target = document.getElementById(`entry-${targetId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#entry-${targetId}`);
  }

  if (!session) {
    return (
      <main className="pixel-bg min-h-screen flex items-center justify-center p-6">
        <LoginScreen onSuccess={loadEntries} />
      </main>
    );
  }

  if (blockedUser) {
    return (
      <main className="pixel-bg min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-800">
            Access restricted
          </h1>
          <p className="mt-2 text-zinc-600 text-sm">
            This diary is private for the two invited accounts.
          </p>
          <button className="btn btn-primary mt-5" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="pixel-bg min-h-screen p-5 md:p-10">
      <section className="max-w-3xl mx-auto">
        <header className="card p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-rose-500">Shared diary</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-800">
              Hi {welcomeName}, keep this memory cozy.
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMemory(true)}
            >
              + Add memory
            </button>
            <button className="btn btn-soft" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        {entries.length > 0 ? (
          <section className="card p-5 mt-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-rose-500">Memory calendar jump</p>
                <p className="text-[10px] text-zinc-500">
                  Pick a date to jump to that day in the timeline.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input"
                  value={jumpDate}
                  onChange={(event) => setJumpDate(event.target.value)}
                />
                <button
                  className="btn btn-soft"
                  onClick={() => jumpDate && jumpToDate(jumpDate)}
                  disabled={!jumpDate || !firstEntryIdByDate[jumpDate]}
                  type="button"
                >
                  Jump
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {timelineDates.slice(0, 14).map((dateValue) => {
                const entryId = firstEntryIdByDate[dateValue];
                return (
                  <a
                    key={dateValue}
                    href={`#entry-${entryId}`}
                    className="btn btn-soft"
                    onClick={() => setJumpDate(dateValue)}
                  >
                    {formatPrettyDate(dateValue)}
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        {showAddMemory ? (
          <section className="card p-5 md:p-6 mt-5">
            <h2 className="text-lg font-medium text-zinc-800">
              Add a new memory
            </h2>
            <form className="mt-4 space-y-4" onSubmit={addMemory}>
              <label className="block text-sm text-zinc-700">
                Title
                <input
                  className="input mt-1"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="A sweet little headline"
                  required
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Memory
                <textarea
                  ref={addMemoryTextareaRef}
                  className="input mt-1 resize-none overflow-hidden"
                  rows={1}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onInput={(event) => autoResizeTextarea(event.currentTarget)}
                  placeholder="What happened today?"
                  required
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Date
                <input
                  type="date"
                  className="input mt-1"
                  value={memoryDate}
                  onChange={(event) => setMemoryDate(event.target.value)}
                  required
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEntry}
                >
                  {savingEntry ? "Saving..." : "Save memory"}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => setShowAddMemory(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-800">Timeline</h2>
            <button
              className="text-sm text-zinc-500 hover:text-zinc-700"
              onClick={loadEntries}
            >
              Refresh
            </button>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {loadingEntries ? (
            <p className="text-zinc-500">Loading memories...</p>
          ) : entries.length === 0 ? (
            <div className="card p-6 text-sm text-zinc-600">
              Your timeline is empty. Tap{" "}
              <span className="font-medium">Add memory</span> to start your
              story.
            </div>
          ) : (
            <ul className="space-y-4">
              {entries.map((entry) => (
                <li key={entry.id} id={`entry-${entry.id}`} className="card p-5">
                  {editingEntryId === entry.id ? (
                    <form
                      className="space-y-4"
                      onSubmit={(event) => saveEdit(event, entry.id)}
                    >
                      <p className="text-xs uppercase tracking-wide text-rose-500">
                        Editing memory by {entry.author_name}
                      </p>
                      <label className="block text-sm text-zinc-700">
                        Title
                        <input
                          className="input mt-1"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          required
                        />
                      </label>
                      <label className="block text-sm text-zinc-700">
                        Memory
                        <textarea
                          ref={editMemoryTextareaRef}
                          className="input mt-1 resize-none overflow-hidden"
                          rows={1}
                          value={editContent}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                          onInput={(event) =>
                            autoResizeTextarea(event.currentTarget)
                          }
                          required
                        />
                      </label>
                      <label className="block text-sm text-zinc-700">
                        Date
                        <input
                          type="date"
                          className="input mt-1"
                          value={editMemoryDate}
                          onChange={(event) =>
                            setEditMemoryDate(event.target.value)
                          }
                          required
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={savingEdit}
                        >
                          {savingEdit ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-rose-500">
                        {formatPrettyDate(entry.memory_date)} by{" "}
                        {entry.author_name}
                      </p>
                      <h3 className="text-xl font-medium text-zinc-800 mt-1">
                        {entry.title}
                      </h3>
                      <p className="text-zinc-600 mt-3 whitespace-pre-wrap">
                        {entry.content}
                      </p>
                      {hasBeenEdited(entry) ? (
                        <p className="mt-3 text-[10px] text-zinc-500">
                          Edited{" "}
                          {entry.updated_at
                            ? formatDateTime(entry.updated_at)
                            : ""}
                        </p>
                      ) : null}
                      {session?.user?.id === entry.author_id ? (
                        <div className="mt-4">
                          <button
                            className="btn btn-soft"
                            onClick={() => startEdit(entry)}
                          >
                            Edit memory
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
