import os
import re
import pandas as pd


# --------------------------------------------------
# Paths
# --------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.abspath(
    os.path.join(SCRIPT_DIR, "../data")
)

ROAD_FILE = os.path.join(
    DATA_PATH,
    "Road Dataset.csv"
)

DISASTER_FILE = os.path.join(
    DATA_PATH,
    "Disaster Dataset.csv"
)

OUTPUT_FILE = os.path.join(
    DATA_PATH,
    "risk_training_dataset.csv"
)

CLEANING_REPORT_FILE = os.path.join(
    DATA_PATH,
    "dataset_cleaning_report.csv"
)


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def get_route_code(text):
    """
    Extract route codes such as:
    A1, A26, B245, E01, B-Road
    """

    text = str(text).strip()

    match = re.match(
        r"(A\d+|B-\w+|B\d+|E\d+)",
        text,
        flags=re.IGNORECASE,
    )

    if match:
        return match.group(1).upper()

    return "UNKNOWN"


def get_segment_number(text):
    """
    Extract:
    'Segment 40' -> 40
    """

    match = re.search(
        r"Segment\s+(\d+)",
        str(text),
        flags=re.IGNORECASE,
    )

    if match:
        return int(match.group(1))

    return None


def get_km_start(text):
    """
    Extract:
    '(KM 40-42)' -> 40
    """

    match = re.search(
        r"KM\s*(\d+)",
        str(text),
        flags=re.IGNORECASE,
    )

    if match:
        return int(match.group(1))

    return None


def clean_text(value):
    """
    Remove broken quote characters and excess spaces.
    """

    if pd.isna(value):
        return ""

    value = str(value)

    value = value.replace('"', "")
    value = value.strip()

    return value


def numeric_or_nan(value):
    """
    Convert value to number.
    Invalid values become NaN.
    """

    return pd.to_numeric(
        value,
        errors="coerce"
    )


def convert_risk(value):
    """
    Convert the source Severity Level into
    the classifier target labels.

    IMPORTANT:
    severity_level must NEVER be used as an
    ML input feature because risk_level is
    derived directly from it.
    """

    value = str(value).strip().lower()

    if value == "high":
        return "High"

    if value == "medium":
        return "Medium"

    if value == "low":
        return "Low"

    return None


def safe_mode(series, fallback="Unknown"):
    """
    Return most common non-null categorical value.
    """

    clean = (
        series
        .dropna()
        .astype(str)
        .str.strip()
    )

    clean = clean[
        clean != ""
    ]

    if clean.empty:
        return fallback

    return clean.mode().iloc[0]


# --------------------------------------------------
# Disaster dataset repair
# --------------------------------------------------

def load_and_repair_disaster_dataset():

    print("Loading disaster dataset...")

    disasters = pd.read_csv(
        DISASTER_FILE
    )

    disasters.columns = (
        disasters.columns
        .astype(str)
        .str.strip()
    )

    repaired_rows = []

    repair_count = 0


    # Because the source CSV has a trailing comma,
    # pandas may create an "Unnamed" column.
    unnamed_columns = [
        column
        for column in disasters.columns
        if column.lower().startswith("unnamed")
    ]

    extra_column = (
        unnamed_columns[0]
        if unnamed_columns
        else None
    )


    for index, row in disasters.iterrows():

        original_occurrence = row.get(
            "Historical Occurrence Count"
        )

        occurrence_numeric = pd.to_numeric(
            original_occurrence,
            errors="coerce",
        )


        repaired = False


        # --------------------------------------------------
        # Repair malformed Expressway rows
        #
        # Raw example:
        #
        # ...,Normal Curve,"""""May-Jul",
        # " Oct-Dec""""",55,Recommendation
        #
        # Pandas interprets this approximately as:
        #
        # season              -> ""May-Jul
        # occurrence_count    -> Oct-Dec""
        # safety advice       -> 55
        # unnamed extra col   -> Recommendation
        # --------------------------------------------------

        if pd.isna(occurrence_numeric):

            possible_count = pd.to_numeric(
                row.get(
                    "Safety Recommendation"
                ),
                errors="coerce",
            )

            extra_advice = (
                row.get(extra_column)
                if extra_column is not None
                else None
            )


            if (
                not pd.isna(possible_count)
                and extra_advice is not None
                and not pd.isna(extra_advice)
            ):

                season_part_1 = clean_text(
                    row.get(
                        "Month/Season of High Risk"
                    )
                )

                season_part_2 = clean_text(
                    original_occurrence
                )


                if (
                    season_part_1
                    and season_part_2
                ):

                    repaired_season = (
                        f"{season_part_1} / "
                        f"{season_part_2}"
                    )

                elif season_part_1:

                    repaired_season = (
                        season_part_1
                    )

                else:

                    repaired_season = (
                        season_part_2
                    )


                disasters.at[
                    index,
                    "Month/Season of High Risk"
                ] = repaired_season


                disasters.at[
                    index,
                    "Historical Occurrence Count"
                ] = possible_count


                disasters.at[
                    index,
                    "Safety Recommendation"
                ] = clean_text(
                    extra_advice
                )


                repair_count += 1
                repaired = True


        repaired_rows.append({

            "row_index":
                index,

            "route_name":
                row.get(
                    "Route Name",
                    ""
                ),

            "source_repaired":
                int(repaired),

        })


    # Clean text fields

    text_columns = [

        "Route Name",

        "Disaster/Risk Type",

        "Severity Level",

        "Primary Risk Factor",

        "Month/Season of High Risk",

        "Safety Recommendation",

    ]


    for column in text_columns:

        if column in disasters.columns:

            disasters[column] = (
                disasters[column]
                .apply(clean_text)
            )


    disasters[
        "Historical Occurrence Count"
    ] = pd.to_numeric(

        disasters[
            "Historical Occurrence Count"
        ],

        errors="coerce",
    )


    # Source repair metadata

    repair_df = pd.DataFrame(
        repaired_rows
    )

    disasters[
        "source_repaired"
    ] = repair_df[
        "source_repaired"
    ].values


    print(
        "Malformed source rows repaired:",
        repair_count
    )


    remaining_invalid = (
        disasters[
            "Historical Occurrence Count"
        ]
        .isna()
        .sum()
    )


    print(
        "Remaining invalid occurrence counts:",
        remaining_invalid
    )


    return disasters


# --------------------------------------------------
# Road dataset
# --------------------------------------------------

def load_road_dataset():

    print("Loading road dataset...")

    roads = pd.read_csv(
        ROAD_FILE
    )

    roads.columns = (
        roads.columns
        .astype(str)
        .str.strip()
    )


    roads["route_code"] = (
        roads[
            "Route/Segment Name"
        ]
        .apply(get_route_code)
    )


    roads["segment_number"] = (
        roads[
            "Route/Segment Name"
        ]
        .apply(get_segment_number)
    )


    numeric_columns = [

        "Max Gradient (%)",

        "Average Elevation",

        "Surface Friction Index",

    ]


    for column in numeric_columns:

        roads[column] = pd.to_numeric(
            roads[column],
            errors="coerce",
        )


    return roads


# --------------------------------------------------
# Route-level road profile
# --------------------------------------------------

def create_route_profile(
    available_roads
):

    return {

        "Route/Segment Name":
            "Route Aggregate Profile",

        "Max Gradient (%)":
            available_roads[
                "Max Gradient (%)"
            ].median(),

        "Terrain Type":
            safe_mode(
                available_roads[
                    "Terrain Type"
                ]
            ),

        "Road Surface Condition":
            safe_mode(
                available_roads[
                    "Road Surface Condition"
                ]
            ),

        "Average Elevation":
            available_roads[
                "Average Elevation"
            ].median(),

        "Surface Friction Index":
            available_roads[
                "Surface Friction Index"
            ].median(),

        "Typical Road Width":
            safe_mode(
                available_roads[
                    "Typical Road Width"
                ]
            ),

    }


# --------------------------------------------------
# Dataset builder
# --------------------------------------------------

def build_dataset():

    disasters = (
        load_and_repair_disaster_dataset()
    )

    roads = load_road_dataset()


    print("\nPreparing route information...")


    disasters["route_code"] = (
        disasters[
            "Route Name"
        ]
        .apply(get_route_code)
    )


    disasters["km_start"] = (
        disasters[
            "Route Name"
        ]
        .apply(get_km_start)
    )


    results = []


    exact_count = 0

    route_level_count = 0

    no_road_count = 0


    print("Building training dataset...")


    for _, disaster in disasters.iterrows():

        route_code = (
            disaster["route_code"]
        )


        available_roads = roads[
            roads["route_code"]
            ==
            route_code
        ]


        selected = None

        match_type = None


        # --------------------------------------------------
        # Exact segment match
        # --------------------------------------------------

        km_start = disaster["km_start"]


        if (
            len(available_roads) > 0
            and not pd.isna(km_start)
        ):

            exact = available_roads[
                available_roads[
                    "segment_number"
                ]
                ==
                int(km_start)
            ]


            if len(exact) > 0:

                selected = (
                    exact.iloc[0]
                )

                match_type = "exact"

                exact_count += 1


        # --------------------------------------------------
        # Route-level aggregate
        # --------------------------------------------------

        if (
            selected is None
            and len(available_roads) > 0
        ):

            selected = create_route_profile(
                available_roads
            )

            match_type = (
                "route-level"
            )

            route_level_count += 1


        # --------------------------------------------------
        # No road dataset coverage
        # --------------------------------------------------

        if selected is None:

            selected = {

                "Route/Segment Name":
                    "No Road Data Available",

                "Max Gradient (%)":
                    None,

                "Terrain Type":
                    "Unknown",

                "Road Surface Condition":
                    "Unknown",

                "Average Elevation":
                    None,

                "Surface Friction Index":
                    None,

                "Typical Road Width":
                    "Unknown",

            }


            match_type = (
                "no-road-data"
            )

            no_road_count += 1


        risk_level = convert_risk(
            disaster[
                "Severity Level"
            ]
        )


        results.append({

            "route_code":
                route_code,

            "route_name":
                disaster[
                    "Route Name"
                ],

            "road_segment":
                selected[
                    "Route/Segment Name"
                ],

            "gradient":
                selected[
                    "Max Gradient (%)"
                ],

            "terrain":
                selected[
                    "Terrain Type"
                ],

            "road_surface":
                selected[
                    "Road Surface Condition"
                ],

            "elevation":
                selected[
                    "Average Elevation"
                ],

            "friction":
                selected[
                    "Surface Friction Index"
                ],

            "road_width":
                selected[
                    "Typical Road Width"
                ],

            "hazard_type":
                disaster[
                    "Disaster/Risk Type"
                ],

            "risk_factor":
                disaster[
                    "Primary Risk Factor"
                ],

            "season":
                disaster[
                    "Month/Season of High Risk"
                ],

            "historical_occurrence_count":
                disaster[
                    "Historical Occurrence Count"
                ],

            # Metadata only.
            # DO NOT use this as an ML feature.
            "severity_level":
                disaster[
                    "Severity Level"
                ],

            "risk_level":
                risk_level,

            "road_data_available":
                (
                    0
                    if match_type
                    ==
                    "no-road-data"
                    else 1
                ),

            # Metadata only.
            "match_type":
                match_type,

            # Metadata only.
            "source_repaired":
                int(
                    disaster[
                        "source_repaired"
                    ]
                ),

        })


    final = pd.DataFrame(
        results
    )


    # --------------------------------------------------
    # Validation
    # --------------------------------------------------

    print("\nValidating final dataset...")


    invalid_risk = (
        final[
            "risk_level"
        ]
        .isna()
        .sum()
    )


    invalid_occurrences = (

        pd.to_numeric(

            final[
                "historical_occurrence_count"
            ],

            errors="coerce",

        )

        .isna()

        .sum()

    )


    print(
        "Invalid risk labels:",
        invalid_risk
    )


    print(
        "Invalid occurrence counts:",
        invalid_occurrences
    )


    if invalid_risk > 0:

        raise ValueError(
            "Dataset contains invalid "
            "risk labels."
        )


    if invalid_occurrences > 0:

        raise ValueError(
            "Dataset still contains "
            "non-numeric historical "
            "occurrence counts."
        )


    # --------------------------------------------------
    # Save final dataset
    # --------------------------------------------------

    final.to_csv(
        OUTPUT_FILE,
        index=False
    )


    # --------------------------------------------------
    # Save small cleaning summary
    # --------------------------------------------------

    cleaning_report = pd.DataFrame({

        "metric": [

            "total_disaster_records",

            "final_training_rows",

            "repaired_source_rows",

            "exact_matches",

            "route_level_matches",

            "no_road_data_records",

            "high_risk_rows",

            "medium_risk_rows",

            "low_risk_rows",

        ],

        "value": [

            len(disasters),

            len(final),

            int(
                final[
                    "source_repaired"
                ].sum()
            ),

            exact_count,

            route_level_count,

            no_road_count,

            int(
                (
                    final[
                        "risk_level"
                    ]
                    ==
                    "High"
                ).sum()
            ),

            int(
                (
                    final[
                        "risk_level"
                    ]
                    ==
                    "Medium"
                ).sum()
            ),

            int(
                (
                    final[
                        "risk_level"
                    ]
                    ==
                    "Low"
                ).sum()
            ),

        ]

    })


    cleaning_report.to_csv(
        CLEANING_REPORT_FILE,
        index=False
    )


    # --------------------------------------------------
    # Summary
    # --------------------------------------------------

    print("\n================================")
    print("DATASET BUILD COMPLETE")
    print("================================")


    print(
        "Output:",
        OUTPUT_FILE
    )


    print(
        "Total rows:",
        len(final)
    )


    print("\nMatch summary:")

    print(
        final[
            "match_type"
        ]
        .value_counts()
    )


    print("\nRisk distribution:")

    print(
        final[
            "risk_level"
        ]
        .value_counts()
    )


    print("\nSource repairs:")

    print(
        final[
            "source_repaired"
        ]
        .value_counts()
    )


    print(
        "\nCleaning report:",
        CLEANING_REPORT_FILE
    )


    print("================================")


if __name__ == "__main__":
    build_dataset()