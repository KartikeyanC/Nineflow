// Step-by-step "How to connect" for every connection in Settings, shown by components/HowToConnect.jsx.
// One place for all of them, in the words the screens use. **Bold** marks a button or menu name.
// Each guide: { title, steps: [...], link?: { href, label }, note? }.
// Other services change their menus now and then; if a name here no longer matches, the link opens
// the right page anyway.

export const GUIDES = {
  weather: {
    title: 'Weather',
    steps: [
      'Type your city in **Search for your city** and press **Search**.',
      'Pick your city from the list. Weather turns **On** by itself.',
      'Open the **Dashboard**: today\'s weather and the week ahead show under the date.',
    ],
    note: 'No account needed. Only the city is sent (to Open-Meteo).',
  },
  holidays: {
    title: 'Public holidays',
    steps: [
      'Turn **Public holidays** to **On**.',
      'Choose your **Country**.',
      'Holidays appear on **Week**, **Month** and the **Dashboard**.',
    ],
    note: 'No account needed. Only the country is sent (to Nager.Date). A few countries have no data.',
  },

  // ---- Send my report to chat
  slack: {
    title: 'Slack',
    link: { href: 'https://api.slack.com/apps', label: 'Open Slack apps' },
    steps: [
      'Open the Slack apps page (link below) and press **Create New App → From scratch**. Name it NineFlow and choose your workspace.',
      'In the app\'s menu open **Incoming Webhooks** and switch it **On**.',
      'Press **Add New Webhook to Workspace**, choose the channel for your reports, and press **Allow**.',
      'Copy the **Webhook URL** (it starts with https://hooks.slack.com/services/).',
      'In NineFlow paste it into **Paste a webhook link**, add a name if you like, and press **Connect**.',
      'Press **Send a test** and check the channel.',
    ],
  },
  discord: {
    title: 'Discord',
    steps: [
      'In Discord, hover over the channel and click the gear (**Edit Channel**). You need permission to manage webhooks on that server.',
      'Open **Integrations → Webhooks → New Webhook**.',
      'Give it a name (NineFlow) and press **Copy Webhook URL**, then **Save Changes**.',
      'In NineFlow paste it into **Paste a webhook link** and press **Connect**.',
      'Press **Send a test** and check the channel.',
    ],
  },
  teams: {
    title: 'Microsoft Teams',
    steps: [
      'In Teams, open the channel, click its **•••** (More options) and choose **Workflows**.',
      'Pick **Post to a channel when a webhook request is received**.',
      'Name it NineFlow, press **Next**, check the team and channel, then **Add workflow**.',
      'Copy the link Teams shows you.',
      'In NineFlow paste it into **Paste a webhook link** and press **Connect**, then **Send a test**.',
    ],
  },
  ntfy: {
    title: 'ntfy (phone notifications)',
    link: { href: 'https://ntfy.sh/', label: 'Open ntfy.sh' },
    steps: [
      'Install the free **ntfy** app on your phone (Play Store or App Store), or open ntfy.sh in a browser.',
      'Press **+** (Subscribe to topic) and make up a hard-to-guess topic name, for example nineflow-ravi-7k3p.',
      'In NineFlow paste https://ntfy.sh/ followed by your topic name, for example https://ntfy.sh/nineflow-ravi-7k3p, and press **Connect**.',
      'Press **Send a test**: a notification arrives on your phone.',
    ],
    note: 'Anyone who knows the topic name can read it, so keep it secret.',
  },
  zapier: {
    title: 'Zapier',
    link: { href: 'https://zapier.com/app/zaps', label: 'Open Zapier' },
    steps: [
      'In Zapier press **Create → Zap**.',
      'For the trigger choose **Webhooks by Zapier → Catch Hook**, then **Continue**. (Webhooks by Zapier needs a paid Zapier plan.)',
      'Copy the **webhook URL** Zapier gives you (it starts with https://hooks.zapier.com/).',
      'In NineFlow paste it into **Paste a webhook link**, press **Connect**, then **Send a test**.',
      'Back in Zapier press **Test trigger** to see the test, add the action you want (email, WhatsApp, a sheet…), and **Publish**.',
    ],
  },
  make: {
    title: 'Make',
    link: { href: 'https://www.make.com/', label: 'Open Make' },
    steps: [
      'In Make press **Create a new scenario**.',
      'Add the module **Webhooks → Custom webhook**, press **Add**, name it NineFlow and **Save**.',
      'Copy the address Make shows (it starts with https://hook.).',
      'In NineFlow paste it into **Paste a webhook link**, press **Connect**, then **Send a test**. Make shows "Successfully determined".',
      'Add the next steps you want in Make and switch the scenario **On**.',
    ],
    note: 'Custom webhooks work on Make\'s free plan.',
  },

  calendarLink: {
    title: 'Calendar link',
    steps: [
      'Press **Create my calendar link**, then **Copy**.',
      'Google Calendar (on a computer): **Settings → Add calendar → From URL**, paste the link and press **Add calendar**.',
      'Outlook: **Calendar → Add calendar → Subscribe from web**, paste the link and press **Import**.',
      'iPhone: **Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar**, paste the link. On a Mac: Calendar **File → New Calendar Subscription**.',
      'Your tasks appear there and update by themselves. Google refreshes subscribed calendars every few hours, so changes are not instant.',
    ],
    note: 'Anyone with the link can see your task titles and times. If it gets out, press Make a new link.',
  },

  googleCalendar: {
    title: 'Google Calendar',
    steps: [
      'Under **Google Calendar** press **Connect Google Calendar**.',
      'Choose the same Google account you sign in with, tick the calendar permission, and press **Continue**.',
      'Tasks with a date now become events in your main calendar and change when the tasks do.',
      'To see your calendar\'s own events in NineFlow, switch **Show my calendar events here** to **On**.',
      'To add other calendars (family, work), open **My other calendars → Choose calendars** and tick them.',
    ],
    note: 'If Google says the app is unverified, press Advanced → Go to NineFlow. That appears while NineFlow is still in Google\'s review.',
  },
  googleExport: {
    title: 'Google Sheets and Docs',
    steps: [
      'Press **All tasks to a Google Sheet** or **The day\'s report to a Google Doc**.',
      'NineFlow makes the file in your Google Drive, in the NineFlow folder.',
      'Press **Open it** to see it. It is a copy: it does not change when your tasks do, so export again for a fresh one.',
    ],
  },
  email: {
    title: 'Email to NineFlow',
    steps: [
      'Press **Get my address**, then **Copy**.',
      'Save the address as a contact (for example "NineFlow").',
      'Forward or send any email to it. The subject becomes the task name, and words like "tomorrow 3pm !high" set its day, time and priority. The email text goes into the notes.',
      'To be safe, put your own email addresses in **Only from**, so nobody else can add tasks.',
    ],
  },

  // ---- Your tools
  gtasks: {
    title: 'Google Tasks',
    steps: [
      'Press **Connect with Google**.',
      'Choose the Google account you sign in with, tick the Google Tasks permission, and press **Continue**.',
      'Press **Import from Google Tasks** to bring your open tasks in, or **Send … tasks** to copy a day\'s tasks to your Google Tasks list.',
    ],
    note: 'Google Tasks keeps no times, so tasks arrive there as all-day tasks.',
  },
  microsoft: {
    title: 'Microsoft Outlook and To Do',
    steps: [
      'Open NineFlow in a web browser (this one works on the website, not in the Windows or phone app).',
      'Press **Connect with Microsoft**, sign in with your Microsoft account, and press **Accept**.',
      'Press **Import from Microsoft To Do** to bring tasks in, or **Send … tasks to Outlook** to add a day\'s tasks to your Outlook calendar.',
    ],
    note: 'Microsoft signs web apps out after about a day, so you may need to press Connect again.',
  },
  todoist: {
    title: 'Todoist',
    link: { href: 'https://app.todoist.com/app/settings/integrations/developer', label: 'Open Todoist developer settings' },
    steps: [
      'In Todoist open **Settings → Integrations → Developer** (link below).',
      'Press **Copy API token**.',
      'In NineFlow press **Connect**, paste it into **API token**, and press **Connect**.',
      'Press **Import from Todoist** and tick the tasks to bring in.',
    ],
  },
  trello: {
    title: 'Trello',
    link: { href: 'https://trello.com/power-ups/admin', label: 'Open Trello Power-Ups admin' },
    steps: [
      'Open the Trello Power-Ups admin page (link below) and press **New**. Name it NineFlow, pick your workspace, fill in your email, and press **Create**.',
      'Open its **API key** tab and press **Generate a new API key**. Copy the **API key**.',
      'Next to the key, click the **Token** link, press **Allow**, and copy the token it shows.',
      'In NineFlow press **Connect**, paste the **API key** and the **Token**, and press **Connect**.',
      'Press **Import from Trello** to bring in the cards assigned to you.',
    ],
  },
  github: {
    title: 'GitHub',
    link: { href: 'https://github.com/settings/personal-access-tokens/new', label: 'Create a GitHub token' },
    steps: [
      'Open the new-token page (link below). Name the token NineFlow and choose an expiry date.',
      'Under **Repository access** choose **All repositories** (or only the ones you want).',
      'Under **Permissions → Repository permissions** set **Issues** and **Pull requests** to **Read-only**.',
      'Press **Generate token** and copy it (it starts with github_pat_).',
      'In NineFlow press **Connect**, paste it into **Personal access token**, press **Connect**, then **Import from GitHub**.',
    ],
  },
  clockify: {
    title: 'Clockify',
    link: { href: 'https://app.clockify.me/user/preferences#advanced', label: 'Open Clockify preferences' },
    steps: [
      'In Clockify click your profile picture → **Preferences → Advanced** (link below).',
      'Under **API key** press **Generate** (or **Manage API keys → Generate new**) and copy the key.',
      'In NineFlow press **Connect**, paste it into **API key**, and press **Connect**.',
      'After a focus session, press **Send … time**: the session becomes a Clockify time entry.',
    ],
  },
  toggl: {
    title: 'Toggl Track',
    link: { href: 'https://track.toggl.com/profile', label: 'Open Toggl profile' },
    steps: [
      'In Toggl Track open **Profile settings** (link below).',
      'Scroll down to **API Token**, click to show it, and copy it.',
      'In NineFlow press **Connect**, paste it into **API token**, and press **Connect**.',
      'After a focus session, press **Send … time**: the session becomes a Toggl time entry.',
    ],
  },
  notion: {
    title: 'Notion',
    link: { href: 'https://www.notion.so/profile/integrations', label: 'Open Notion integrations' },
    steps: [
      'Open Notion integrations (link below) and press **New integration**. Name it NineFlow, choose your workspace, keep the type **Internal**, and **Save**.',
      'Press **Show** next to **Internal Integration Secret** and copy it.',
      'In Notion, open (or make) a database with a title column. Add a **Date** column if you want the task dates.',
      'On the database press **•••** → **Connections** (or **Connect to**) and add **NineFlow**.',
      'Press **•••** → **Copy link** to copy the database link.',
      'In NineFlow press **Connect**, paste the **Integration secret** and the **Database link**, and press **Connect**. Then **Send … tasks** adds the day\'s tasks as rows.',
    ],
  },
  telegram: {
    title: 'Telegram',
    link: { href: 'https://t.me/BotFather', label: 'Open @BotFather' },
    steps: [
      'In Telegram open **@BotFather** (the one with the blue tick) and send **/newbot**.',
      'Give the bot a name, then a username ending in "bot" (for example ravi_nineflow_bot).',
      'BotFather sends you a token (numbers, a colon, then letters). Copy it.',
      'In NineFlow press **Connect**, paste it into **Bot token**, and press **Connect**.',
      'Open your new bot in Telegram (BotFather gives its link), press **Start**, and send it any message.',
      'Back in NineFlow press **Find my chat**. Then switch on adding tasks by message if you want: "call Sam tomorrow 3pm 30m".',
    ],
    note: 'Messages are checked about once a minute while NineFlow is open.',
  },
}

// The chat services share one "Send my report to chat" box.
export const CHAT_GUIDES = ['slack', 'discord', 'teams', 'ntfy', 'zapier', 'make']
