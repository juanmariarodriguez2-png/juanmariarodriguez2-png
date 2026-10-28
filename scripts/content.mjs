/**
 * Static profile content.
 *
 * Everything that is not pulled from the GitHub API lives here, so editing the
 * profile text never requires touching the rendering code. After changing it,
 * run `npm run generate` (or wait for the daily Action) to rebuild the SVGs.
 */

export const LOGIN = 'juanmariarodriguez2-png';

/** Rendered as `juan@github ~ $ <command>` at the top of every window. */
export const PROMPT = { user: 'juan', host: 'github', path: '~' };

export const intro = {
  greeting: "Hi, I'm Juan 👋",
  role: 'Economics + Data Science student at CUNEF Universidad (Madrid)',
  founder: 'PayPeek',
  pitch:
    'I work where economic reasoning meets data: understanding the question first, ' +
    'then building the analysis (or the tool) behind it myself.',
};

export const building = {
  name: 'PayPeek',
  url: 'paypeek.es',
  summary: 'An open, anonymous database of internships in Spain.',
  lead: 'It shows what interns actually get:',
  points: ['pay', 'job offers afterwards', 'real work vs. filler', 'what they learn'],
};

export const projects = [
  {
    name: 'Is It Worth What They Score?',
    what: 'Do NBA teams pay proportionally for points? 15 seasons, 1,600+ players',
    tools: 'Tableau',
  },
  {
    name: 'Boeing (BA) Return Analysis',
    what: 'Monthly returns 2000–2026: volatility, fat tails, regression vs. S&P 500',
    tools: 'R, Excel',
  },
  {
    name: 'Microeconomics Question Bank',
    what: 'Exam-practice web app used by 64 students',
    tools: 'Supabase, PostgreSQL',
  },
  {
    name: "Ballon d'Or 2026 Model",
    what: 'Data model to predict the winner',
    tools: 'Python',
  },
  {
    name: 'Neural Networks in E-commerce',
    what: 'Recommendation, fraud detection and demand forecasting use cases',
    tools: 'Teachable Machine',
  },
];

/** Brand colours match the shields.io badges of the original README. */
export const stack = [
  { name: 'Python', color: '#3776AB' },
  { name: 'R', color: '#276DC3' },
  { name: 'SQL', color: '#4479A1' },
  { name: 'Tableau', color: '#E97627' },
  { name: 'Excel', color: '#217346' },
  { name: 'Supabase', color: '#3FCF8E' },
];

/** Each entry is one log line: [level, segments]. */
export const beforeUniversity = [
  ['info', [['t', 'Founded '], ['a bo', 'Veldor Time'], ['t', ', an independent watch brand I ran for two years.']]],
  ['info', [['t', 'Sourcing, hand assembly, photography, website, sales and shipping.']]],
  ['done', [['t', '~72 units sold.']]],
];

export const contact = [
  { key: 'linkedin', value: 'linkedin.com/in/juan-rodriguez-cunef', href: 'https://www.linkedin.com/in/juan-rodriguez-cunef' },
  { key: 'web', value: 'paypeek.es', href: 'https://paypeek.es' },
  { key: 'email', value: 'juanmaria.rodriguezestrada@gmail.com', href: 'mailto:juanmaria.rodriguezestrada@gmail.com' },
  { key: 'status', value: 'Open to summer internships in economics, markets and data.' },
];

/** Languages to leave out of the neofetch language breakdown (e.g. 'HTML'). */
export const excludedLanguages = ['HTML'];
