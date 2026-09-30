# Shortlist demo: recording script (~2 minutes)

**Goal of the video:** get the recruiter to agree to a 20-minute feedback call.

## Before you record
1. Start the app (if it isn't running): `cd demo && npm run dev`, then open **http://localhost:3001** in Chrome.
2. Reset from any earlier take: `cd demo && npm run reset`. This restores every pipeline to its seeded state, removes today's resume upload so Camila can be added fresh, and moves all dates forward so "interview today" is true on the day you record.
3. Chrome: hide the bookmarks bar (⇧⌘B), close other tabs, make the window full-screen and keep zoom at **100%** (⌘0). The layout has three columns (navigation, the list, and a candidate preview on the right) and needs a window at least 1440px wide; below 1280px the preview turns into a slide-over.
4. Open Finder at `demo/recording/` next to the browser so you can drag **Camila-Estrada-Pohl-Resume.pdf** in.
5. Record with QuickTime (⌘⇧5 → *Record Selected Portion*), framing only the browser window. Turn on your mic for voiceover, or record silently and add voiceover later.

**Waiting times:** the resume drop and ranking take about 25–30 s, suggestions about 20–25 s, and search about 4 s. Cut those waits when editing (iMovie, CapCut or Screen Studio). The progress steps on screen make the cuts look natural.

---

## Scene 1: Today (0:00–0:20)
**Screen:** the Today page (`/`). The first item (an overdue step) is already open in the preview on the right.
**Do:** pause on the numbers at the top, then click **Yuki Tanaka-Brooks** (Interview, Today) so her profile fills the preview.
**Say:** "This is Shortlist. When I open it in the morning, it tells me what needs me across every open job. Yuki has a client interview today, and her whole profile is right here. Hannah was submitted to Cobalt Pay two weeks ago with no reply, so that's a chase. And Ana Lucia interviews with them tomorrow."

## Scene 2: A job's applicants (0:20–0:45)
**Do:** click **Open jobs** → **Senior Data Engineer** (Cobalt Pay) → the **Applicants** tab.
**Screen:** 13 applicants ranked by fit, with two strong fits on top. **Darius** is selected automatically, and the preview shows his score, the evidence, and a red "Rejected by Cobalt Pay · Apr 2026" flag.
**Say:**
- "Thirteen people applied. It's already ranked them against the must-haves, so I only need to look closely at two."
- On **Darius**: "It remembers Cobalt Pay turned him down in April, and why, so I can decide whether to try again."
- Click **Other applicants**, then **Terrence Boyle**: "And it tells me when someone's applied to more than one of this client's roles."

## Scene 3: Drop in a resume (0:45–1:05)
**Do:** drag **Camila-Estrada-Pohl-Resume.pdf** from Finder onto the drop zone at the top of the tab.
**Screen:** "Reading resume → Building profile → Ranking against applicants", then "Added Camila Estrada-Pohl: ranked #1 of 14 applicants." She's selected, and the preview shows a score in the mid-90s with the evidence.
**Say:** "A resume comes in by email. I drop it on the job: it becomes a full profile, no typing, and it's ranked against everyone else who applied. She goes straight to the top."

## Scene 4: Suggested from your pool (1:05–1:30)
**Do:** click **Suggested from your pool** → **Find suggestions**.
**Screen:** progress steps, then six people who haven't applied. **Ana Lucia Ferreira** is in the top two (the order can vary between takes).
**Do:** click **Ana Lucia**. The preview shows her fit and an amber "Already in process with Cobalt Pay (Analytics Engineer, client interview)" flag.
**Say:** "It also looks through everyone I already know who hasn't applied. Ana Lucia is a great fit, and it reminds me she's already interviewing with Cobalt Pay for another role, so I can raise it with the client instead of double-submitting."
**Do:** click **Add to pipeline** in the preview, then the **Pipeline** tab.
**Say:** "One click and she's in this job's pipeline too." (She's at the top of the New column, with Camila.)

## Scene 5: Search the talent pool (1:30–1:45)
**Do:** click **Talent pool**, click the search box (or press ⌘K) and type, or paste from `search.txt`:
> data engineers in Florida who know Spark and have payments experience, talked to in the last 6 months

Press Enter.
**Screen:** the "Searching for" tags, then the matching people, with the first one open in the preview.
**Say:** "And when I need someone new, I can search everyone I've ever engaged the way I'd describe them out loud, no Boolean strings."

## Scene 6: Close (1:45–2:00)
**Screen:** go back to **Today**.
**Say:** "This is an early prototype for solo and small-agency recruiters. I'd love 20 minutes to hear how you run your day and whether this would help. [Link / reply to book a time]."

---

## Notes
- Every candidate, company and client is fictional (emails use `mailbox.example`, phones use 555 numbers). It's safe to show on screen.
- Retake as often as you like: run `npm run reset` between takes. Camila ranked #1 in every test run (96–97, ahead of Darius at 88). If she ever lands at #2, say "she goes straight to the top of the list" instead.
- Moving someone between stages (the stage dropdown, **Move to screen** and **Reject** in the preview) works but isn't in the script.
- **New job order** is in the right-hand pane on Open jobs. It creates a job from a pasted job order and immediately runs suggestions for it. It's not in the script; `recording/job-order.txt` has a sample to paste.
- Press Esc (or ×) to close the preview.
- `npm run seed:pipeline` rebuilds the jobs and pipelines from the existing pool (about 4 minutes and roughly $0.50 of API usage). `npm run seed` rebuilds everything, including the candidate pool and this resume (about 10 minutes and roughly $3.50); names like Darius and Ana Lucia will change and this script will need updating.
