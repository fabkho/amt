---
name: write-application
description: Prepare a job application with amt — draft the cover letter with the user under their tone rules, render CV and letter into the application folder, and track the applied status. Use when the user wants to apply to a job, write a cover letter, or prepare application documents.
---

# Write an application (amt)

amt is installed as an MCP server (`amt`) and a CLI (`amt … --json`). The user's tone rules and language rule live in their profile — `discover` and the `write-application` MCP prompt surface them.

1. **Read the posting:** `get_job` (or the `job://<slug>` resource) — frontmatter facts plus the full description.
2. **Pick the language** using the profile's language rule; confirm with the user.
3. **Scaffold:** call `prepare_application` (or `amt prepare <slug> --lang <de|en>`). First run creates `cover-letter.<lang>.md` with subject and salutation; nothing renders while the placeholder is untouched.
4. **Draft with the user in chat**, strictly following the profile's tone rules. Iterate until they approve, then write the agreed text into the markdown file (blank-line-separated paragraphs between salutation and closing).
5. **Render:** call `prepare_application` again — it emits txt/html/pdf next to the CV. Follow the result's `next` hint.
6. **After the user submits:** `set_job_status <slug> applied`.

If `prepare` fails with `CV_DATA_MISSING`, help the user create `cv-data.<lang>.yaml` in their amt home (schema: personal/profile/links/experience/education/skills/projects).
