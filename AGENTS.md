# KernelLens — Antigravity Master Development & Git Workflow

This document codifies the operational rules and standards for developing **KernelLens AI** in repository:
**`shreyans-chowdry/KernelLens`** ([GitHub Repo](https://github.com/shreyans-chowdry/KernelLens)).

---

## 1. Project Organization & Ownership
- **Repository:** `shreyans-chowdry/KernelLens`
- **Owner & Maintainer:** Shreyans Chowdry
- **Development Team:** 3-member team using Antigravity for vibe coding.
- **Merge Authority:** **Only Shreyans Chowdry** is authorized to approve and merge Pull Requests into `develop` or `main`.

---

## 2. Permanent Branch Architecture
```
main (Production / Final Release Only)
 └── develop (Permanent Integration Branch)
      ├── feature/feature-name
      ├── feature/feature-name
      └── feature/feature-name
```

### Branch Responsibilities
1. **`main`**:
   - Production / final submission branch.
   - **Never** develop directly on `main`.
   - **Never** create feature branches from `main`.
   - Updated **only** when the entire project is completed and Shreyans explicitly declares final release.
   - **Never** merge individual feature branches directly into `main`.

2. **`develop`**:
   - Active integration branch throughout development.
   - **Never** directly push feature implementation code to `develop`.
   - All feature branches must branch from the latest `develop`.
   - All Pull Requests must target `develop`.
   - **Never delete `develop`** after individual feature merges. `develop` remains permanent until the final project release into `main`.

3. **`feature/<feature-name>`**:
   - Dedicated branch for each feature, bugfix, or doc task.
   - Naming convention: lowercase kebab-case (`feature/<feature-name>`).
     - Examples: `feature/log-collector`, `feature/log-parser`, `feature/anomaly-classifier`, `feature/event-correlation`, `feature/fastapi-backend`, `feature/llm-analysis`, `feature/dashboard`, `feature/incident-history`, `feature/evaluation`.
     - Bugfixes: `feature/fix-<name>` or on the current feature branch.
     - Documentation: `feature/docs-<name>`.
   - Each branch must represent one coherent piece of work.

---

## 3. Step-by-Step Developer Workflow

```
Is this a new feature?
       │ YES
       ▼
Check current Git state (git status, git branch)
       │
       ▼
Update develop (git checkout develop && git pull origin develop)
       │
       ▼
Create feature branch (git checkout -b feature/<feature-name>)
       │
       ▼
Implement & Test on feature branch
       │
       ▼
Meaningful Commits (feat:, fix:, test:, refactor:, docs:, chore:)
       │
       ▼
Push feature branch (git push -u origin feature/<feature-name>)
       │
       ▼
Open Pull Request: BASE: develop ⟵ HEAD: feature/<feature-name>
       │
       ▼
Shreyans Chowdry reviews & approves PR
       │
       ▼
Merged into develop (GitHub automatically deletes feature branch)
```

---

## 4. Commit Message Convention
Meaningful commits with standard prefixes:
- `feat: <description>` (new feature/capability)
- `fix: <description>` (bug fix)
- `test: <description>` (adding or modifying tests)
- `refactor: <description>` (code refactoring without behavior change)
- `docs: <description>` (documentation changes)
- `chore: <description>` (build, dependencies, tool configuration)

*Forbidden:* vague commits like `update`, `changes`, `wip`, `final`, `test`.

---

## 5. Branch Safety Rule
If Antigravity is on `main` or `develop` and a development task begins:
1. **DO NOT start coding on `main` or `develop`.**
2. Inspect current status: `git status`, `git branch --show-current`.
3. Synchronize `develop`: `git checkout develop && git pull origin develop`.
4. Create and checkout the feature branch: `git checkout -b feature/<feature-name>`.
5. Implement, test, and commit only on the feature branch.

---

## 6. Keeping Feature Branches Synchronized
When `develop` advances during feature development:
```bash
git fetch origin
git checkout feature/<feature-name>
git merge origin/develop
```
Resolve any conflicts carefully before continuing.

---

## 7. Autonomy vs. Permissions
- **Autonomous Operations:** Antigravity runs routine Git commands (status, branch, diff, checkout -b, commit, push, create PR) without repeatedly asking for permission.
- **Prohibitions:**
  - Never force push to `main` or `develop` (`git push --force` prohibited).
  - Never merge PRs without owner authorization.
  - Never bypass branch protection or security controls.

---

## 8. Final Project Release Workflow
Triggered **only** when Shreyans explicitly commands:
> *"KernelLens is complete. Prepare the final release."*

1. Verify `develop` contains all completed work.
2. Run full test suite, linting, build checks, and security validation (no secrets, no debug flags).
3. Create Pull Request: `BASE: main` ⟵ `HEAD: develop`.
4. Shreyans reviews and merges `develop` into `main`.
5. Only after `main` is merged and released can `develop` be deleted.

---

## 9. KernelLens Technical Architecture
```
Linux Log Sources (/var/log, dmesg, journalctl)
   │
   ▼
Log Collection & Ingestion
   │
   ▼
Log Parsing & Normalization
   │
   ▼
Anomaly Filtering (Machine Learning)
   │
   ▼
Temporal & Event Correlation (Machine Learning)
   │
   ▼
Context Construction & Graph Assembly
   │
   ▼
LLM Root-Cause Analysis
   │
   ▼
Cause + Evidence + Confidence Scoring
   │
   ▼
Troubleshooting & Remediation Guidance
   │
   ▼
Database Persistence
   │
   ▼
Interactive Real-Time Dashboard
```
