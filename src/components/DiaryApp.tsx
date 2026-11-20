"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, TouchEvent } from "react";
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

function authorDisplayName(
  authorId: string,
  currentUserId: string | null,
  currentUserName: string,
  profilesById: Record<string, Profile>,
  entries: Entry[],
): string {
  if (authorId === currentUserId) return currentUserName;
  return (
    profilesById[authorId]?.nickname ||
    entries.find((entry) => entry.author_id === authorId)?.author_name ||
    "Your partner"
  );
}

export function DiaryApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
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
  const [bookOpen, setBookOpen] = useState(false);
  const [selectedBookDate, setSelectedBookDate] = useState("");
  const [showBlankDays, setShowBlankDays] = useState(false);
  const [mobileBookPage, setMobileBookPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<"all" | "me" | string>("all");
  const [exporting, setExporting] = useState<boolean>(false);
  const addMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editMemoryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const addMemorySectionRef = useRef<HTMLElement | null>(null);
  const lastEntryTouchRef = useRef<{ entryId: string; at: number } | null>(null);

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

  function openAddMemory(date = toLocalDateInputValue(new Date())) {
    setMemoryDate(date);
    setShowAddMemory(true);
  }

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

  const loadProfiles = useCallback(async () => {
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
  }, []);

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
    setShowAddMemory(false);
  }

  function startEdit(entry: Entry) {
    setEditingEntryId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditMemoryDate(entry.memory_date);
    setError(null);
  }

  function handleEntryTouchEnd(event: TouchEvent<HTMLDivElement>, entry: Entry) {
    if (entry.author_id !== userId) return;
    const now = Date.now();
    const previousTap = lastEntryTouchRef.current;
    if (previousTap?.entryId === entry.id && now - previousTap.at < 450) {
      event.preventDefault();
      lastEntryTouchRef.current = null;
      startEdit(entry);
      return;
    }
    lastEntryTouchRef.current = { entryId: entry.id, at: now };
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
        loadProfiles();
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
        loadProfiles();
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
    if (!showAddMemory) return;
    const frame = window.requestAnimationFrame(() => {
      const section = addMemorySectionRef.current;
      if (!section) return;
      const top = section.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showAddMemory]);

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

  const bookDates = useMemo(() => {
    const dates = Array.from(new Set(filteredEntries.map((entry) => entry.memory_date))).sort();
    return dates;
  }, [filteredEntries]);

  useEffect(() => {
    if (!bookDates.length) {
      setSelectedBookDate("");
      return;
    }
    if (!selectedBookDate || (!showBlankDays && !bookDates.includes(selectedBookDate))) {
      setSelectedBookDate(bookDates[bookDates.length - 1]);
    }
  }, [bookDates, selectedBookDate, showBlankDays]);

  const selectedDateEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.memory_date === selectedBookDate),
    [filteredEntries, selectedBookDate],
  );

  const selectedDateByAuthor = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of selectedDateEntries) {
      const authorEntries = map.get(entry.author_id) ?? [];
      authorEntries.push(entry);
      map.set(entry.author_id, authorEntries);
    }
    return map;
  }, [selectedDateEntries]);

  const bookAuthors = useMemo(() => {
    const ids = Array.from(new Set([
      ...Object.keys(profilesById),
      ...filteredEntries.map((entry) => entry.author_id),
    ]));
    const myIndex = ids.indexOf(userId ?? "");
    if (myIndex > 0) ids.unshift(ids.splice(myIndex, 1)[0]);
    while (ids.length < 2) ids.push(`partner-page-${ids.length}`);
    return ids.slice(0, 2);
  }, [filteredEntries, profilesById, userId]);

  function shiftBookDate(direction: -1 | 1) {
    if (!selectedBookDate) return;
    if (showBlankDays) {
      const next = parseDateOnlyAsLocal(selectedBookDate);
      next.setDate(next.getDate() + direction);
      setSelectedBookDate(toLocalDateInputValue(next));
      return;
    }
    const index = bookDates.indexOf(selectedBookDate);
    if (direction > 0 && index === bookDates.length - 1 && bookDates.length > 0) {
      const today = toLocalDateInputValue(new Date());
      setSelectedBookDate(today);
      openAddMemory(today);
      return;
    }
    if (index < 0) {
      const neighbor = direction > 0
        ? bookDates.find((date) => date > selectedBookDate)
        : [...bookDates].reverse().find((date) => date < selectedBookDate);
      if (neighbor) setSelectedBookDate(neighbor);
      else if (direction > 0) {
        const today = toLocalDateInputValue(new Date());
        setSelectedBookDate(today);
        openAddMemory(today);
      }
      return;
    }
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < bookDates.length) setSelectedBookDate(bookDates[nextIndex]);
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
      <section className="max-w-4xl mx-auto diary-layout">
        <header className="card diary-topbar p-3 md:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="avatar-box diary-topbar-avatar">
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
            <h1 className="text-lg md:text-xl font-semibold text-zinc-800">
              {welcomeName}
            </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={() => openAddMemory()}
            >
              + Add memory
            </button>
            <button className="btn btn-soft" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        {showAddMemory ? (
          <section ref={addMemorySectionRef} className="diary-add-panel card p-5 md:p-6 mt-5">
            <h2 className="text-lg font-medium text-zinc-800">
              Add a new memory
            </h2>
            <form className="mt-4 space-y-4" onSubmit={addMemory}>
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
              <label className="block text-sm text-zinc-700">
                Title
                <input
                  className="input diary-content-text mt-1"
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
                  className="input diary-content-text diary-add-memory-textarea mt-1 resize-none overflow-hidden"
                  rows={4}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onInput={(event) => autoResizeTextarea(event.currentTarget)}
                  placeholder="What happened today?"
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
                  {savingEntry ? "Saving..." : "Publish"}
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
          <section className="diary-drafts-panel card p-5 md:p-6 mt-5">
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

        <section className="diary-book-section mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-rose-500">Our shared story</p>
              <h2 className="text-xl font-semibold text-zinc-800">The diary</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input" value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)} aria-label="Filter by author">
                <option value="all">Both authors</option>
                <option value="me">My entries</option>
                {authorOptions.filter((option) => option.id !== userId).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              <input className="input" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search memories" aria-label="Search memories" />
            </div>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {loadingEntries ? <p className="text-zinc-500">Loading memories...</p> : !bookOpen ? (
            <button type="button" className="diary-cover" onClick={() => setBookOpen(true)} aria-label="Open the diary">
              <span className="diary-cover-kicker">A little book of</span>
              <span className="diary-cover-title">Our Days<br />Together</span>
              <span className="diary-cover-mark">✿</span>
              <span className="diary-cover-note">A shared book for two</span>
              <span className="diary-cover-open">Open the diary <span aria-hidden="true">→</span></span>
            </button>
          ) : (
            <div className="diary-book">
              <div className="diary-toolbar">
                <button className="btn btn-soft" type="button" onClick={() => setBookOpen(false)}>‹ Cover</button>
                <label className="diary-date-label" aria-label="Choose diary date">
                  <input className="input" type="date" value={selectedBookDate} aria-label="Choose diary date" onChange={(event) => setSelectedBookDate(event.target.value)} />
                </label>
                <label className="diary-blank-toggle"><input type="checkbox" checked={showBlankDays} onChange={(event) => setShowBlankDays(event.target.checked)} /> Include blank days</label>
              </div>
              <div className="diary-spread-heading">
                <button type="button" className="btn btn-soft" onClick={() => shiftBookDate(-1)} disabled={!selectedBookDate || (!showBlankDays && bookDates.indexOf(selectedBookDate) <= 0)}>← Previous</button>
                <div><p className="diary-date-kicker">A day in our story</p><h3>{selectedBookDate ? formatPrettyDate(selectedBookDate) : "Choose a date"}</h3></div>
                <button type="button" className="btn btn-soft" onClick={() => shiftBookDate(1)} disabled={!selectedBookDate || (!showBlankDays && bookDates.length === 0)}>{!showBlankDays && bookDates.length > 0 && bookDates.indexOf(selectedBookDate) === bookDates.length - 1 ? "New entry →" : "Next →"}</button>
              </div>
              <div className="diary-mobile-tabs" role="tablist" aria-label="Diary pages">
                {bookAuthors.map((authorId, index) => {
                  const authorName = authorDisplayName(authorId, userId, welcomeName, profilesById, filteredEntries);
                  return <button key={authorId} type="button" role="tab" aria-selected={mobileBookPage === index} className={mobileBookPage === index ? "diary-mobile-tab active" : "diary-mobile-tab"} onClick={() => setMobileBookPage(index)}>{authorName}</button>;
                })}
              </div>
              {searchQuery.trim() ? <p className="px-5 pb-3 text-xs text-zinc-500">{filteredEntries.length} matching {filteredEntries.length === 1 ? "memory" : "memories"} across {bookDates.length} {bookDates.length === 1 ? "date" : "dates"}</p> : null}
              <div className="diary-spread">
                {bookAuthors.map((authorId, pageIndex) => {
                  const authorName = authorDisplayName(authorId, userId, welcomeName, profilesById, filteredEntries);
                  const authorAvatar = profilesById[authorId]?.avatar_url;
                  const authorEntries = selectedDateByAuthor.get(authorId) ?? [];
                  return <article className={`diary-page${mobileBookPage === pageIndex ? " is-mobile-active" : ""}`} key={authorId}>
                    <div className="diary-page-author">
                      <div className="diary-author-identity">
                        <div className="diary-author-avatar">
                          {authorAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={authorAvatar} alt={`${authorName} profile`} />
                          ) : <span>{initialsFromName(authorName)}</span>}
                        </div>
                        <span className="diary-author-name">{authorName}</span>
                      </div>
                    </div>
                    {authorEntries.length ? authorEntries.map((entry) => <div className="diary-memory" key={entry.id}>
                      {editingEntryId === entry.id ? <form className="space-y-3" onSubmit={(event) => saveEdit(event, entry.id)}>
                        <label className="block text-sm">Title<input className="input mt-1" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required /></label>
                        <label className="block text-sm">Memory<textarea ref={editMemoryTextareaRef} className="input diary-content-text mt-1 resize-y" rows={4} value={editContent} onChange={(event) => setEditContent(event.target.value)} required /></label>
                        <label className="block text-sm">Date<input className="input mt-1" type="date" value={editMemoryDate} onChange={(event) => setEditMemoryDate(event.target.value)} required /></label>
                        <div className="flex flex-wrap gap-2"><button className="btn btn-primary" type="submit" value="publish" disabled={savingEdit}>Save changes</button><button className="btn btn-soft" type="submit" value="draft" disabled={savingEdit}>Save draft</button><button className="btn btn-soft" type="button" onClick={cancelEdit}>Cancel</button></div>
                      </form> : <>
                        <div
                          className={entry.author_id === userId ? "diary-memory-copy is-editable" : "diary-memory-copy"}
                          onDoubleClick={entry.author_id === userId ? () => startEdit(entry) : undefined}
                          onTouchEnd={(event) => handleEntryTouchEnd(event, entry)}
                        >
                          <h4>{entry.title}</h4>
                          <p className="diary-content-text whitespace-pre-wrap">{entry.content}</p>
                        </div>
                        {hasBeenEdited(entry) && entry.updated_at ? <p className="mt-2 text-[10px] text-zinc-500">Edited {formatDateTime(entry.updated_at)}</p> : null}
                        {userId ? <EntryInteractions entryId={entry.id} userId={userId} displayName={welcomeName} /> : null}
                      </>}
                    </div>) : <div className="diary-empty"><span className="diary-empty-flower">✿</span><p>{selectedBookDate ? "No memory on this page yet." : "Choose a date to open this page."}</p>{selectedBookDate ? <button className="btn btn-primary" type="button" onClick={() => openAddMemory(selectedBookDate)}>Write a memory</button> : null}</div>}
                    {authorEntries.length > 0 && authorEntries.every((entry) => entry.author_id === userId) ? <button className="btn btn-primary mt-3" type="button" onClick={() => openAddMemory(selectedBookDate)}>+ Add another memory</button> : null}
                  </article>;
                })}
              </div>
              <div className="diary-book-footer">
                <span>{bookDates.length} {bookDates.length === 1 ? "written day" : "written days"}</span>
                <span className="diary-book-hint">Use the date picker to find any day</span>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={exportAsMarkdown}
                  disabled={loadingEntries || filteredEntries.length === 0 || exporting}
                >
                  {exporting ? "Exporting..." : "Export Markdown"}
                </button>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
