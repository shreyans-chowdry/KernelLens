---
trigger: always_on
description: Master Development & Git Workflow for KernelLens AI
---

# KernelLens — Master Development & Git Workflow Rule

## 1. Project Repository & Roles
- **Repository:** `shreyans-chowdry/KernelLens` (https://github.com/shreyans-chowdry/KernelLens)
- **Owner & Final Maintainer:** Shreyans Chowdry
- **Team:** 3-member team using Antigravity for vibe coding.

## 2. Permanent Branch Architecture
```text
main (Final Production / Submission ONLY)
 └── develop (Integration Branch — NEVER delete during development)
      ├── feature/feature-name
      ├── feature/feature-name
      └── feature/feature-name
```

## 3. Branch Responsibilities & Rules
### `main`
- Final production/submission branch.
- **NEVER** develop directly on `main`.
- **NEVER** create feature branches from `main` during normal development.
- Contains only stable, completed, review-ready code.
- Updated **ONLY** when the entire KernelLens project is complete and Shreyans explicitly declares final release.
- **NEVER** merge feature branches directly into `main`.

### `develop`
- Main integration branch.
- **NEVER** directly push feature implementation code to `develop`.
- Feature branches **must** be created from the latest `develop`.
- Pull Requests from feature branches **must target `develop`**.
- **Only Shreyans Chowdry** is allowed to merge feature Pull Requests into `develop`.
- **NEVER delete `develop`** after individual feature merges. It is a permanent branch during development.

### `feature/<feature-name>`
- Every individual development task must occur on a feature branch.
- Naming: `feature/<feature-name>` (lowercase kebab-case).
  - Examples: `feature/log-collector`, `feature/log-parser`, `feature/anomaly-classifier`, `feature/event-correlation`, `feature/fastapi-backend`, `feature/llm-analysis`, `feature/dashboard`, `feature/incident-history`, `feature/evaluation`.
  - Documentation branches: `feature/docs-<name>`.
  - Bugfix branches: `feature/fix-<name>` or on the existing feature branch.
- Single coherent scope per feature branch.

## 4. Standard Development Cycle
1. **Sync develop:**
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. **Create feature branch:**
   ```bash
   git checkout -b feature/<feature-name>
   ```
3. **Implement, test, and commit** only on `feature/<feature-name>`.
4. **Push branch:**
   ```bash
   git push -u origin feature/<feature-name>
   ```
5. **Open Pull Request:**
   - Base: `develop`
   - Head: `feature/<feature-name>`
6. **Owner Merge & Auto-Deletion:**
   - Shreyans reviews, approves, and merges into `develop`.
   - GitHub auto-deletes the feature branch upon merge.

## 5. Branch Safety Rule (Strict)
If Antigravity is on `main` or `develop` and the task involves implementing a new feature or code changes:
- **DO NOT** write code on `main` or `develop`.
- Inspect current state (`git status`, `git branch`).
- Update `develop` (`git pull origin develop`).
- Create and switch to `feature/<feature-name>`.
- Implement on that feature branch.

## 6. Commit Message Standards
Use clear, meaningful commit messages with conventional prefixes:
- `feat: <description>`
- `fix: <description>`
- `test: <description>`
- `refactor: <description>`
- `docs: <description>`
- `chore: <description>`
- **No** meaningless commits (`update`, `changes`, `wip`, `final`, etc.).

## 7. Autonomy vs. Merge Authority
- **Autonomy:** Antigravity runs routine Git commands autonomously (status, branch, fetch, diff, checkout -b, commit, push, create PR). Do not repeatedly ask trivial permission.
- **Merge Authority:** Only Shreyans Chowdry merges PRs into `develop`. Antigravity does not bypass owner review.
- **Safety:** NEVER force push to `main` or `develop` (`git push --force` prohibited).

## 8. KernelLens Technical Architecture
The Git workflow exists to organize the implementation of the core technical pipeline:
```text
Linux Log Sources
  ↓
Log Collection (dmesg, journalctl, syslog)
  ↓
Log Parsing & Normalization
  ↓
Anomaly Filtering (ML)
  ↓
Temporal/Event Correlation (ML)
  ↓
Context Construction
  ↓
LLM Root-Cause Analysis
  ↓
Cause + Evidence + Confidence
  ↓
Troubleshooting Guidance
  ↓
Database
  ↓
Interactive Dashboard
```
Do not modify the technical architecture merely to satisfy Git workflow.
