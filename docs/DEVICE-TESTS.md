# Device tests

Checks only a real person can do: they need a microphone, a Google account or a phone. About 15 minutes.
Tick each one; if one fails, note what you saw (a screenshot helps).

Install first: quit NineFlow from the tray (right-click → Quit), run `release/NineFlow-Setup-0.1.29.exe`,
and install `release/NineFlow-0.1.29.apk` on the phone.

Already checked on this computer (2 Nov 2026, in the real Windows app): notes are written to the folder,
with their pictures; a deleted note moves to `deleted/`; a file edited in Notepad reaches NineFlow;
file names that try to leave the folder, and folders you didn't choose, are refused.

## 1. Speak tasks

**Phone**
- [ ] Open **More → Speak tasks**. Android asks for the microphone once: allow it.
- [ ] Say: *"Call the bank at 11 high priority, then gym at 6 pm for 1 hour, also revise physics every Monday."*
- [ ] Three tasks appear in the preview: Call the bank (11 am, high), Gym (6 pm, 1h), Revise physics (repeats Mondays).
- [ ] **Add** them; they show on Today / the Monday after.
- [ ] Deny the microphone once (Android Settings → Apps → NineFlow → Permissions): Speak tasks shows a message instead of listening, and nothing crashes.

**Windows**
- [ ] Ctrl+K → Speak tasks. Click in the box, press **Windows + H**, and speak the same sentence.
- [ ] The same three tasks appear (made on this device, with no internet needed).

## 2. Notes as files (Windows)

- [ ] Settings → Notes on this computer → **Choose a folder** (try a new folder in Documents).
- [ ] Every note appears as a `.md` file; notes with pictures have them in `pictures/`.
- [ ] Edit a note in NineFlow: the file changes within a couple of seconds.
- [ ] Open a file in Notepad, change a line, save: NineFlow shows the change.
- [ ] Make a new `.md` file in the folder: it becomes a note in NineFlow.
- [ ] Delete a note in NineFlow: its file moves to `deleted/`, named with today's date and your local time.
- [ ] Delete a file in the folder: NineFlow asks whether to keep or remove that note.
- [ ] Close and reopen NineFlow: nothing is duplicated.
- [ ] On the phone, after Drive syncs, the same notes are there.

## 3. Google Drive reconnect

- [ ] Windows: if the Drive badge says **Reconnect**, press it. The browser opens Google's page (or it
      reconnects at once); after you allow it, the badge turns to saved.
- [ ] Phone: the same, if it ever asks.
- [ ] If it still fails, copy the exact message it shows.

Expect this about once a week until the Google sign-in is published (Google lets an app in Testing
keep a sign-in for only 7 days; see GOOGLE_SETUP.md).

## 4. Quick look at the newer screens (phone and Windows)

- [ ] **Working charts**: each chart's range menu changes only that chart; on the phone the dates under the bars don't overlap.
- [ ] **Notes**: with many notes, `/` jumps to search, #tags and the quick filters narrow the list, list view works.
- [ ] **Revise**: write `capital of France :: Paris` in a note, then Revise shows it; Space shows the answer, 1 / 2 grade it.
- [ ] **Search** (Ctrl+K, or the magnifier above + on the phone) finds tasks and notes.
