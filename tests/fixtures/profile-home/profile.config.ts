import { defineProfile } from '../../../src/define-profile.js'

export default defineProfile({
  identity: {
    name: 'Jane Doe',
    role: {
      de: 'Senior Software Engineerin',
      en: 'Senior Software Engineer',
    },
    email: 'jane@example.com',
    phone: '+49 000 0000000',
    location: { de: 'Berlin / Remote', en: 'Berlin, Germany / Remote' },
    languagesLine: {
      de: 'Deutsch (Muttersprache) · Englisch (fließend)',
      en: 'German (native) · English (fluent)',
    },
    links: [{ label: 'github.com/janedoe', url: 'https://github.com/janedoe' }],
  },
  search: {
    stacksPrimary: ['vue', 'typescript'],
    stacksSecondary: ['php'],
    salaryFloor: 68_000,
    salaryTarget: 75_000,
    maxYearsRequired: 4,
    locations: {
      remote: true,
      cities: [{ name: 'Berlin', minHomeOfficeDays: 3 }],
    },
    titleBlocklist: ['vibe coding'],
  },
  sources: {
    ats: { recruitee: ['examplecorp'] },
    boards: ['arbeitnow'],
  },
  tone: {
    salutation: { de: 'Hallo,', en: 'Hi,' },
    closing: { de: 'Viele Grüße', en: 'Best regards' },
    rules: ['no brand names', 'no impact numbers'],
    languageRule: 'en when English is required and German only a plus',
  },
  paths: {
    notesDir: '~/notes/jobs',
    outputBase: '~/applications',
  },
})
