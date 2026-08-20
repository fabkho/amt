import { parse } from 'yaml'
import { z } from 'zod'
import { JobKitError } from './errors.js'

// Bullets and skill values may contain inline HTML (<b>, <code>, &amp;) —
// the templates render them unescaped, matching the original Jinja2 setup.

const experienceEntry = z.object({
  company: z.string(),
  location: z.string(),
  date: z.string(),
  position: z.string().optional(),
  subtitle: z.string().optional(),
  bullets: z.array(z.string()),
})

const educationEntry = z.object({
  school: z.string(),
  program: z.string(),
  date: z.string(),
  bullets: z.array(z.string()),
})

const link = z.object({
  label: z.string(),
  url: z.string(),
})

export const cvDataSchema = z.object({
  personal: z.object({
    name: z.string(),
    role: z.string(),
  }),
  profile: z.string(),
  links: z.array(link).optional(),
  experience: z.array(experienceEntry),
  education: z.array(educationEntry),
  skills: z.array(z.object({ key: z.string(), val: z.string() })),
  projects: z.array(
    z.object({ name: z.string(), url: z.string(), desc: z.string() }),
  ),
})

export type CvData = z.infer<typeof cvDataSchema>
export type CvLink = z.infer<typeof link>

export function loadCvData(yamlText: string): CvData {
  let raw: unknown
  try {
    raw = parse(yamlText)
  } catch (error) {
    throw new JobKitError(
      'CV_DATA_INVALID',
      `CV data is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const result = cvDataSchema.safeParse(raw)
  if (!result.success) {
    throw new JobKitError('CV_DATA_INVALID', z.prettifyError(result.error))
  }
  return result.data
}
