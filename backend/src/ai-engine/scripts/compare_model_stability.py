"""Development-only stability diagnostic for the official v2 workflow.

This script delegates to train_models_v2 so it cannot maintain a second,
contradictory selection method. It does not update evidence CSVs or the
deployment artifact; run train_models_v2.py for the official workflow.
"""

from train_models_v2 import run_development_stability_diagnostic


if __name__ == "__main__":
    run_development_stability_diagnostic()
