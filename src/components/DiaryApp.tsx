"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { displayNameFromEmail, isAllowedEmail } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import type { Entry, Profile } from "@/lib/types";
import { EntryInteractions } from "./EntryInteractions";
import { LoginScreen } from "./LoginScreen";

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnlyAsLocal(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function formatPrettyDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateOnlyAsLocal(value)
    : new Date(value);
  return date.toLocaleDateString(undefined, {
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

function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getSubmitAction(event: FormEvent<HTMLFormElement>): "publish" | "draft" {
  const native = event.nativeEvent as Event & {
    submitter?: HTMLButtonElement;
  };
  return native.submitter?.value === "draft" ? "draft" : "publish";
}

export function DiaryApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [avatarUrlInput, setAvatarUrlInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [memoryDate, setMemoryDate] = useState(toLocalDateInputValue(new Date()));
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editMemoryDate, setEditMemoryDate] = useState("");
  const [jumpDate, setJumpDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<"all" | "me" | string>("all");
  const [exporting, setExporting] = useState<boolean>(false);
  const addMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const userEmail = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;
  const blockedUser = session && !isAllowedEmail(userEmail);

  const currentProfile = userId ? profilesById[userId] : undefined;
  const welcomeName = currentProfile?.nickname || displayNameFromEmail(userEmail);
  const welcomeAvatar = currentProfile?.avatar_url || null;

  const getEntryDisplayName = useCallback(
    (entry: Entry): string =>
      profilesById[entry.author_id]?.nickname || entry.author_name,
    [profilesById],
  );

  const getEntryAvatarUrl = useCallback(
    (entry: Entry): string | null =>
      profilesById[entry.author_id]?.avatar_url || null,
    [profilesById],
  );

  const loadEntries = useCallback(async () => {
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
  }, []);

  const loadProfiles = useCallback(async (targetUserId?: string | null) => {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("*");
    if (profilesError) {
      setError(profilesError.message);
      return;
    }

    const nextMap: Record<string, Profile> = {};
    for (const profile of (data as Profile[]) ?? []) {
      nextMap[profile.user_id] = profile;
    }
    setProfilesById(nextMap);

    const profileUserId = targetUserId ?? userId;
    if (profileUserId && nextMap[profileUserId]) {
      setNicknameInput(nextMap[profileUserId].nickname ?? "");
      setAvatarUrlInput(nextMap[profileUserId].avatar_url ?? "");
    }
  }, [userId]);

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user?.id) return;
    const action = getSubmitAction(event);
    if (!title.trim() || !content.trim()) return;

    try {
      setSavingEntry(true);
      setError(null);

      const { error: insertError } = await supabase.from("entries").insert({
        title: title.trim(),
        content: content.trim(),
        is_draft: action === "draft",
        memory_date: memoryDate,
        author_id: session.user.id,
        author_name: currentProfile?.nickname || displayNameFromEmail(userEmail),
      });

      if (insertError) throw insertError;

      setTitle("");
      setContent("");
      setMemoryDate(toLocalDateInputValue(new Date()));
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
    setProfilesById({});
    setShowProfileEditor(false);
    setNicknameInput("");
    setAvatarUrlInput("");
    setShowAddMemory(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user?.id) return;

    const nickname = nicknameInput.trim();
    if (!nickname) {
      setError("Nickname cannot be empty.");
      return;
    }

    try {
      setSavingProfile(true);
      setError(null);

      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          user_id: session.user.id,
          nickname,
          avatar_url: avatarUrlInput.trim() || null,
        },
        { onConflict: "user_id" },
      );

      if (upsertError) throw upsertError;

      await loadProfiles();
      await loadEntries();
      setShowProfileEditor(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save profile.";
      setError(message);
    } finally {
      setSavingProfile(false);
    }
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
    const action = getSubmitAction(event);
    if (!editTitle.trim() || !editContent.trim() || !editMemoryDate) return;

    try {
      setSavingEdit(true);
      setError(null);

      const { error: updateError } = await supabase
        .from("entries")
        .update({
          title: editTitle.trim(),
          content: editContent.trim(),
          is_draft: action === "draft",
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

  async function publishDraft(entryId: string) {
    if (!session?.user?.id) return;
    try {
      setSavingEdit(true);
      setError(null);
      const { error: publishError } = await supabase
        .from("entries")
        .update({ is_draft: false })
        .eq("id", entryId)
        .eq("author_id", session.user.id);
      if (publishError) throw publishError;
      await loadEntries();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to publish draft.";
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
        setNicknameInput(displayNameFromEmail(nextSession.user.email));
        setAvatarUrlInput("");
        loadProfiles(nextSession.user.id);
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
        setNicknameInput(displayNameFromEmail(nextSession.user.email));
        setAvatarUrlInput("");
        loadProfiles(nextSession.user.id);
        loadEntries();
      } else {
        setEntries([]);
        setProfilesById({});
      }
    });

    return () => subscription.unsubscribe();
  }, [loadEntries, loadProfiles]);

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

  const authorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const entry of entries) {
      if (!byId.has(entry.author_id)) {
        byId.set(entry.author_id, getEntryDisplayName(entry));
      }
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [entries, getEntryDisplayName]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entry.is_draft) return false;
      const matchesAuthor =
        authorFilter === "all"
          ? true
          : authorFilter === "me"
            ? entry.author_id === userId
            : entry.author_id === authorFilter;
      if (!matchesAuthor) return false;
      if (!query) return true;
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query) ||
        getEntryDisplayName(entry).toLowerCase().includes(query)
      );
    });
  }, [entries, searchQuery, authorFilter, userId, getEntryDisplayName]);

  const filteredDrafts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (authorFilter !== "all" && authorFilter !== "me") return [];
    return entries.filter((entry) => {
      if (!entry.is_draft) return false;
      if (entry.author_id !== userId) return false;
      if (!query) return true;
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query) ||
        getEntryDisplayName(entry).toLowerCase().includes(query)
      );
    });
  }, [entries, searchQuery, authorFilter, userId, getEntryDisplayName]);

  const firstEntryIdByDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of filteredEntries) {
      if (!map[entry.memory_date]) {
        map[entry.memory_date] = entry.id;
      }
    }
    return map;
  }, [filteredEntries]);

  function jumpToDate(dateValue: string) {
    const targetId = firstEntryIdByDate[dateValue];
    if (!targetId) return;
    const target = document.getElementById(`entry-${targetId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#entry-${targetId}`);
  }

  function buildExportBaseFilename(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `memory-export-${stamp}`;
  }

  function exportAsMarkdown() {
    try {
      setExporting(true);
      const lines: string[] = [];
      lines.push("# Shared Diary Export");
      lines.push("");
      lines.push(`Exported at: ${new Date().toLocaleString()}`);
      lines.push(`Entries: ${filteredEntries.length}`);
      lines.push("");
      if (searchQuery.trim()) lines.push(`Search filter: ${searchQuery.trim()}`);
      if (authorFilter !== "all") {
        const authorName =
          authorFilter === "me"
            ? "Me"
            : authorOptions.find((option) => option.id === authorFilter)?.name ??
              "Selected author";
        lines.push(`Author filter: ${authorName}`);
      }
      if (searchQuery.trim() || authorFilter !== "all") lines.push("");

      for (const entry of filteredEntries) {
        lines.push(`## ${entry.title}`);
        lines.push(
          `Date: ${formatPrettyDate(entry.memory_date)} | Author: ${getEntryDisplayName(entry)}`,
        );
        if (entry.mood_tags && entry.mood_tags.length > 0) {
          lines.push(`Mood tags: ${entry.mood_tags.map((tag) => `#${tag}`).join(", ")}`);
        }
        if (hasBeenEdited(entry) && entry.updated_at) {
          lines.push(`Edited: ${formatDateTime(entry.updated_at)}`);
        }
        lines.push("");
        lines.push(entry.content);
        lines.push("");
      }

      downloadTextFile(
        `${buildExportBaseFilename()}.md`,
        lines.join("\n"),
        "text/markdown;charset=utf-8",
      );
    } finally {
      setExporting(false);
    }
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
        <div className="card max-w-lg w-full p-8 text-center">
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
      <section className="max-w-4xl mx-auto">
        <header className="card p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="avatar-box avatar-box-large">
              {welcomeAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={welcomeAvatar}
                  alt={`${welcomeName} avatar`}
                />
              ) : (
                <span>{initialsFromName(welcomeName)}</span>
              )}
            </div>
            <div>
            <p className="text-sm text-rose-500">Shared diary</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-800">
              Hi {welcomeName}, keep this memory cozy.
            </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMemory(true)}
            >
              + Add memory
            </button>
            <button
              className="btn btn-soft"
              onClick={() => setShowProfileEditor((current) => !current)}
            >
              {showProfileEditor ? "Close profile" : "Edit profile"}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={exportAsMarkdown}
              disabled={loadingEntries || filteredEntries.length === 0 || exporting}
            >
              {exporting ? "Exporting..." : "Export Markdown"}
            </button>
            <button className="btn btn-soft" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        {showProfileEditor ? (
          <section className="card p-5 md:p-6 mt-5">
            <h2 className="text-lg font-medium text-zinc-800">
              Profile settings
            </h2>
            <form className="mt-4 space-y-4" onSubmit={saveProfile}>
              <label className="block text-sm text-zinc-700">
                Nickname
                <input
                  className="input mt-1"
                  value={nicknameInput}
                  onChange={(event) => setNicknameInput(event.target.value)}
                  placeholder="How your name appears in the diary"
                  required
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Avatar image URL (optional)
                <input
                  className="input mt-1"
                  value={avatarUrlInput}
                  onChange={(event) => setAvatarUrlInput(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingProfile}
                >
                  {savingProfile ? "Saving..." : "Save profile"}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => setShowProfileEditor(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </section>
        ) : null}

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
                  className="input diary-content-text mt-1 resize-none overflow-hidden"
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
                  value="publish"
                  className="btn btn-primary"
                  disabled={savingEntry}
                >
                  {savingEntry ? "Saving..." : "Publish memory"}
                </button>
                <button
                  type="submit"
                  value="draft"
                  className="btn btn-soft"
                  disabled={savingEntry}
                >
                  {savingEntry ? "Saving..." : "Save draft"}
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

        {filteredDrafts.length > 0 ? (
          <section className="card p-5 md:p-6 mt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-zinc-800">My drafts</h2>
              <p className="text-[10px] text-zinc-500">
                Private to your account until published
              </p>
            </div>
            <ul className="mt-4 space-y-3">
              {filteredDrafts.map((entry) => (
                <li key={entry.id} className="border border-zinc-200 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-amber-600">
                    Draft saved {formatDateTime(entry.updated_at ?? entry.created_at)}
                  </p>
                  <h3 className="mt-1 text-base font-medium text-zinc-800">
                    {entry.title}
                  </h3>
                  <p className="diary-content-text text-zinc-600 mt-2 line-clamp-3 whitespace-pre-wrap">
                    {entry.content}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() => startEdit(entry)}
                    >
                      Edit draft
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => publishDraft(entry.id)}
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Publishing..." : "Publish now"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-medium text-zinc-800">Timeline</h2>
            <div className="flex items-center gap-2">
              <select
                className="input"
                value={authorFilter}
                onChange={(event) => setAuthorFilter(event.target.value)}
              >
                <option value="all">All authors</option>
                <option value="me">Me</option>
                {authorOptions
                  .filter((option) => option.id !== userId)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
              <div className="relative flex-1 md:flex-none">
                <input
                  className="input pr-8"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search memories..."
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                    onClick={() => setSearchQuery("")}
                  >
                    x
                  </button>
                ) : null}
              </div>
              <button
                className="text-sm text-zinc-500 hover:text-zinc-700"
                onClick={loadEntries}
              >
                Refresh
              </button>
            </div>
          </div>
          {searchQuery.trim() && (
            <p className="text-[10px] text-zinc-500">
              {filteredEntries.length} {filteredEntries.length === 1 ? "memory" : "memories"} found
              for &ldquo;{searchQuery.trim()}&rdquo;
            </p>
          )}
          {authorFilter !== "all" && (
            <p className="text-[10px] text-zinc-500">
              Filtering by{" "}
              {authorFilter === "me"
                ? "you"
                : authorOptions.find((option) => option.id === authorFilter)?.name ?? "selected author"}
              .
            </p>
          )}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {loadingEntries ? (
            <p className="text-zinc-500">Loading memories...</p>
          ) : filteredEntries.length === 0 ? (
            <div className="card p-6 text-sm text-zinc-600">
              {searchQuery.trim()
                ? "No memories match your search."
                : authorFilter !== "all"
                  ? "No memories found for this author filter."
                : "Your timeline is empty. Tap Add memory to start your story."}
            </div>
          ) : (
            <ul className="space-y-4">
              {filteredEntries.map((entry) => (
                <li key={entry.id} id={`entry-${entry.id}`} className="card p-5">
                  {editingEntryId === entry.id ? (
                    <form
                      className="space-y-4"
                      onSubmit={(event) => saveEdit(event, entry.id)}
                    >
                      <p className="text-xs uppercase tracking-wide text-rose-500">
                        Editing memory by {getEntryDisplayName(entry)}
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
                          className="input diary-content-text mt-1 resize-none overflow-hidden"
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
                          value="publish"
                          className="btn btn-primary"
                          disabled={savingEdit}
                        >
                          {savingEdit ? "Saving..." : "Publish memory"}
                        </button>
                        <button
                          type="submit"
                          value="draft"
                          className="btn btn-soft"
                          disabled={savingEdit}
                        >
                          {savingEdit ? "Saving..." : "Save as draft"}
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
                      <div className="flex items-center gap-3">
                        <div className="avatar-box">
                          {getEntryAvatarUrl(entry) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getEntryAvatarUrl(entry) ?? ""}
                              alt={`${getEntryDisplayName(entry)} avatar`}
                            />
                          ) : (
                            <span className="text-[10px]">
                              {initialsFromName(getEntryDisplayName(entry))}
                            </span>
                          )}
                        </div>
                        <p className="text-xs uppercase tracking-wide text-rose-500">
                          {formatPrettyDate(entry.memory_date)} by{" "}
                          {getEntryDisplayName(entry)}
                        </p>
                      </div>
                      <h3 className="text-xl font-medium text-zinc-800 mt-1">
                        {entry.title}
                      </h3>
                      <p className="diary-content-text text-zinc-600 mt-3 whitespace-pre-wrap">
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
                      <div className="mt-4 flex flex-wrap gap-2">
                        {session?.user?.id === entry.author_id ? (
                          <button
                            className="btn btn-soft"
                            onClick={() => startEdit(entry)}
                          >
                            Edit memory
                          </button>
                        ) : null}
                      </div>
                      {userId ? (
                        <EntryInteractions
                          entryId={entry.id}
                          userId={userId}
                          displayName={welcomeName}
                        />
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
