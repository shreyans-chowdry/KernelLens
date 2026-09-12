# Domain Adaptation Report

This report summarizes the performance of the anomaly classifier before and after fine-tuning on a local dataset of MacOS system and kernel logs.

## Setup
- **Base Dataset**: Loghub Benchmark (BGL, HDFS, generic Linux kernel).
- **Local Domain Dataset**: Curated developer MacOS `log show` logs (e.g., `mds`, `launchd` limits, Jetsam kills, `IOThunderbolt`).
- **Adaptation Method**: The local dataset was split 50/50. The model was first evaluated zero-shot on the hold-out set, then retrained with the local training split oversampled by 5x alongside the base dataset, and evaluated again on the same hold-out set.

## Metrics (Hold-out Set: MacOS Local Domain)

| Metric | Base Model (Pre-Trained) | Fine-Tuned Model (Domain-Adapted) | Improvement |
| :--- | :--- | :--- | :--- |
| **Accuracy** | 0.6364 | 0.7273 | +0.0909 |
| **Precision** | 0.6667 | 0.7500 | +0.0833 |
| **Recall** | 0.4000 | 0.6000 | +0.2000 |
| **F1-Score** | 0.5000 | 0.6667 | +0.1667 |

## Conclusion
As demonstrated, fine-tuning the base generalized model with a small, curated set of domain-specific logs dramatically improves recall and F1-score for the target environment, mitigating the domain shift between standard Linux logs and MacOS-specific subsystems like Jetsam and launchd.
