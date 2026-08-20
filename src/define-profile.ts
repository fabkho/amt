// Separate build entry, exported as 'amt/config'. A profile.config.ts
// imports only this type helper — identity at runtime, editor types at edit
// time — without pulling in the rest of the tool. Validation happens with
// zod when the tool loads the profile, never here.

import type { ProfileInput } from './core/profile.js'

export type { Profile, ProfileInput } from './core/profile.js'

export function defineProfile(profile: ProfileInput): ProfileInput {
  return profile
}
