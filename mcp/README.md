# NineFlow MCP server

Lets Claude read and edit your NineFlow planner: "what's on today?", "move the report to Friday", "add a 30-minute call with the bank at 15:30", "what's overdue?", "tick my reading habit".

It runs **on your computer** (Claude Desktop or Claude Code starts it), and reads and writes the same file the NineFlow app syncs: **My Drive / Daily Planner / planner-data.json** in your Google Drive. There is no NineFlow server in between.

## Tools

| Tool | What it does |
|---|---|
| `get_overview` | Today's date, today's progress, overdue and Someday counts, categories, habits, workspaces |
| `list_tasks` | Tasks by day or range, status (open, done, overdue, all), text, category or tag |
| `get_task` | One task in full |
| `add_task` | New task: day (or Someday), start time, length, priority, category, tags, description, checklist steps |
| `update_task` | Change any of those, or the status (to do, working, in review) |
| `complete_task` | Finish a task, or reopen it. Required steps must be ticked first, unless `force` |
| `delete_task` | Delete a task (Claude asks before using it) |
| `check_habit` | Tick or untick a habit for a day |
| `add_note` | A sticky note on the Notes screen |

Every tool takes an optional `workspace` (name or id) for planners other than the main one.

## Set up (once)

You need [Node.js](https://nodejs.org) 20 or newer, and `desktop/oauth.json` (the "NineFlow desktop" Google client; see [docs/DESKTOP.md](../docs/DESKTOP.md)). It isn't in git, so copy it to each computer that runs this.

1. Install and sign in:

   ```bash
   cd mcp
   npm install
   npm run login
   ```

   Your browser opens Google's sign-in. Use the Google account you use in NineFlow. The sign-in is kept in `~/.nineflow/mcp-google.json`, readable only by you.

2. Add it to Claude.

   **Claude Code:**

   ```bash
   claude mcp add nineflow -- node "F:/Movie/Daily Planer/mcp/server.mjs"
   ```

   **Claude Desktop:** Settings → Developer → Edit Config, and add to `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "nineflow": {
         "command": "node",
         "args": ["F:\\Movie\\Daily Planer\\mcp\\server.mjs"]
       }
     }
   }
   ```

   Restart Claude Desktop. Use the real path to `server.mjs` on your computer.

3. Ask Claude something like *"What's on my NineFlow today?"*

## Good to know

- **The open app catches up by itself.** NineFlow checks the file about once a minute while it's open, and at every start. If the app was in the middle of saving its own change at the same moment, the server redoes its edit on the fresh copy, so neither is lost. If the app had unsaved edits when it picked up Claude's change, it keeps its own version as a "conflict" file in the Daily Planner folder, as it does between two devices.
- **Testing mode:** while the Google app is in Testing, Google ends this sign-in after 7 days. Run `npm run login` again. Publishing the Google app removes the limit.
- **What Claude sees:** only what the tools return (task titles, days, times, categories, tags, descriptions, steps). Anything Claude reads becomes part of your conversation with it.
- **Access:** the `drive.file` permission only shows NineFlow's own files, nothing else in your Drive.
- **Sign out:** `npm run logout` (also revokes the token at Google).
- Repeating tasks are edited one occurrence at a time; new repeating tasks are made in NineFlow itself.

## Files

- `server.mjs`: the MCP server and its tools (and the `login` / `logout` commands).
- `planner.mjs`: the planner file's layout and the task rules (mirrors `src/lib/tasks.js`).
- `drive.mjs`: reading and saving the file in Google Drive, with the "changed meanwhile" check.
- `google.mjs`: Google sign-in for programs on your computer (browser + loopback, PKCE).
