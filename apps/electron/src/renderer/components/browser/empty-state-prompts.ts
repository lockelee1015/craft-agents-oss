export const EMPTY_STATE_PROMPT_SAMPLES = [
  {
    short: 'Open docs and summarize release notes',
    full: 'Open the project docs website, collect the latest release notes, and summarize the key changes in bullets.',
  },
  {
    short: 'Fill a form with provided data',
    full: 'Open the target website, navigate to the form page, and fill all required fields using the data I provide.',
  },
  {
    short: 'Capture screenshot of specific section',
    full: 'Open the page, scroll to the requested section, then capture a screenshot and report the exact location.',
  },
] as const
