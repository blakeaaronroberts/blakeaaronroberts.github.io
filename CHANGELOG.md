# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The site is not
versioned yet; suite modules documented here will carry their own versions.

## [Unreleased]

### Added
- `docs/SCRIBE_HANDOFF.md`, `docs/SCRIBE_TODO.md`: batch S3 (alt text) done.
- `docs/SCRIBE_HANDOFF.md`: every draft is listed in Blake's review queue
  (https://claude.ai/artifact/FDHW1JabMUu84xd2VTm1JV), with an approval dropdown Scribe reads each session.
- `README.md`: what the repository is, how to preview it on Windows, how it
  is published, and where things are. Approved by Scribe, which approves
  READMEs itself (Blake, 2026-11-12).
- `docs/SCRIBE_AUDIT.md`: first documentation audit of this repo, with
  Blake's decisions of 2026-11-12.
- `docs/SCRIBE_TODO.md`: Scribe's task list for this repo.
- `docs/SCRIBE_HANDOFF.md`: builder items, which the Steward folds into
  `docs/STEWARD_HANDOFF.md`.
- `docs/SCRIBE_HANDOFF.md`: standing rule that Scribe writes a ready-to-paste
  prompt whenever Blake must relay something to the Steward.
- `docs/STYLE.md` and `docs/templates/`: copies of the suite's documentation
  style guide and the four page templates (drafts), kept in sync with their
  originals; see `docs/SYNCED.md`.
- `docs/SCRIBE_HANDOFF.md`: standing rule that specs for a new module or
  schema are built by the Steward with Blake; H-S001 now excludes
  `docs/templates/` from rendering.

- `docs/_drafts/products/`: overviews of the five products (Toolbox, Studio,
  Explorations, Practice, Labs), drafts drawn from VISION.md.

### Changed
- `docs/SCRIBE_HANDOFF.md`: corrected for the Steward's queue
  (`docs/STEWARD_HANDOFF.md`): builders record Status there, and Scribe
  copies it back. The Steward is no longer called "Rising Edge" (the
  project's code name).
- `docs/SCRIBE_AUDIT.md`: the pre-launch arrangement and the third-party
  embeds are now settled in VISION.md.
- `docs/SCRIBE_AUDIT.md`, `docs/SCRIBE_HANDOFF.md`, `docs/SCRIBE_TODO.md`:
  batch S1 is done, including the deletion of the stale `gh-pages` branch.
- Draft pages moved into `docs/_drafts/`, which Quarto never renders (batch
  S2); `docs/STYLE.md` re-synced with the rule.
- `docs/STYLE.md`, `docs/SCRIBE_HANDOFF.md`: READMEs need no draft stage;
  Scribe approves them itself.
