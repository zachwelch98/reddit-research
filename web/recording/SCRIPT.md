# Pain Point Miner: recording script (~2 minutes)

**Goal of the video:** show a hiring manager at an AI consulting firm that I can take messy public data and turn it into a ranked, evidence-backed list of problems worth building for, using the same pieces those firms sell (LLM classification, embeddings, clustering, RAG over a database).

## Before you record
1. Start the dashboard (if it isn't running): `cd web && npm run dev`, then open **http://localhost:3000** in Chrome. It reads `data/reddit.db` read-only, so nothing you click can change the data.
2. Scene 4 calls the Anthropic and Voyage APIs, so `.env` needs working `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`. Each question costs about $0.08–0.16.
3. Chrome: hide the bookmarks bar (⇧⌘B), close other tabs, make the window full-screen and keep zoom at **100%** (⌘0).
4. Rehearse Scene 4 once before recording. The answer changes a little between runs, so read it first and pick the finding you'll point at. Reload the page (⌘R) afterwards to clear the chat.
5. Record with QuickTime (⌘⇧5 → *Record Selected Portion*), framing only the browser window. Turn on your mic for voiceover, or record silently and add voiceover later.

**Waiting times:** pages load instantly. The chat answer in Scene 4 runs up to 12 SQL and search calls and can take 30–60 s. Cut that wait when editing; the "Querying the dataset…" line makes the cut look natural.

**Numbers on screen right now:** 43,052 posts (4,698 with comments), 5,111 classified, 624 pain points, 36 clusters, 40 subreddits. If you re-run the pipeline before recording, check these against the page and update the lines below.

---

## Scene 1: The problem list (0:00–0:25)
**Screen:** the **Problems** page (`/`). Hold on the four numbers at the top.
**Say:** "I wanted to find a real business problem that AI can solve before building anything. So I pulled forty-three thousand posts from forty small-business and professional subreddits. Claude Haiku classified five thousand of them and found six hundred and twenty-four real pain points. Then I embedded those and clustered them into thirty-six distinct problems."

## Scene 2: How it ranks (0:25–0:45)
**Screen:** scroll slowly down the ranked table.
**Say:** "Each cluster is scored on how often it comes up, how many different communities raise it, whether people say they'd pay, how badly existing tools serve them, and how well AI fits the problem. The weights live in a config file, so I can tune them."
**Do:** point at row #1, **Recruiters overwhelmed by manual sourcing and screening** (93 posts, score 74.0).
**Say:** "Recruiting came out on top, with ninety-three posts."

> **The yellow "Pilot data" banner** is on screen because no hand labels exist yet. Either say it in one line ("The classifier eval is the next step, so I treat this ranking as directional"), or label 150+ posts first with `npm run label` so the banner goes away. Don't leave it on screen without comment; a reviewer will notice it.

## Scene 3: One problem up close (0:45–1:15)
**Do:** click row #2, **Fragmented tools force manual business ops management**.
**Screen:** score 70.5, 23 posts across 11 subreddits, the problem statement, and "In their words".
**Say:** "Here's number two. Agencies, consultants and small contractors running proposals, invoicing, CRM and projects in separate tools that don't talk to each other. It shows up in eleven different subreddits."
**Do:** point at the first quote only: *"I feel like I can't find one solution that does everything and looks super professional to clients."*
**Say:** "Every claim traces back to a real post."
**Do:** point at the **Tools mentioned** card (QuickBooks, Notion, HubSpot, Jobber, Airtable).
**Say:** "It also pulls out the tools people already use, which is the start of a competitor list."
**Do:** scroll to **Posts (23)**, then click any post title. It opens the Reddit thread in a new tab. Show it for two seconds and switch back.

> Don't read the second quote aloud ("Integrations would break silently…"). It comes from post 1t4bu4p, which the competitor analysis marked as a dev-agency ad. If someone pauses the video on it, that's fine; just don't present it as evidence.

## Scene 4: Ask the data (1:15–1:40)
**Do:** click **Ask the data**, then the suggested question **Which problems have the highest willingness to pay and AI fit?**
**Screen:** "Querying the dataset…", then a Markdown answer with a table and links to posts. Cut the wait.
**Say:** "For anything the table doesn't answer, there's a chat. Claude writes its own read-only SQL and runs semantic search over the posts, and it cites the posts behind every answer, so I can check it."
**Do:** hover over one cited post link in the answer.

## Scene 5: SQL console (1:40–1:50)
**Do:** click **SQL**. The first example query (current clusters by score) runs automatically.
**Say:** "And everything underneath is one SQLite file I can query directly."

## Scene 6: Close (1:50–2:05)
**Screen:** go back to **Problems**.
**Say:** "The top result, recruiting, became a working prototype called Shortlist. Number two became a full competitor analysis. That's the kind of work I'd like to do for clients: start from real evidence, then build. I'd love to talk. [Link / reply to book a time]."

---

## Notes
- All quotes and post titles are public Reddit content. Usernames aren't shown anywhere in the dashboard.
- The **Minimum cluster size** box on the Problems page defaults to 3, which shows all 36 clusters. Leave it alone on camera.
- The other suggested questions on **Ask the data** ("What do property managers complain about most?", "What manual paperwork do accountants hate?") also work well if you'd rather show a narrower question. Rehearse whichever you pick.
- Want to cut Scene 5? Go straight from Scene 4 to the close. The video still runs about 1:50.
- Re-running `npm run collect`, `classify`, `embed` or `cluster` changes the counts, cluster IDs and possibly the order of the top rows. Check Scenes 1–3 against the page after any re-run.
