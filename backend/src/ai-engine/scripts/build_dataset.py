import pandas as pd
import os
import re


DATA_PATH = "../data"

ROAD_FILE = os.path.join(DATA_PATH, "Road Dataset.csv")
DISASTER_FILE = os.path.join(DATA_PATH, "Disaster Dataset.csv")

OUTPUT_FILE = os.path.join(DATA_PATH, "risk_training_dataset.csv")


def get_route_code(text):
    text = str(text)

    match = re.match(
        r"(A\d+|B-\w+|B\d+|E\d+)",
        text
    )

    if match:
        return match.group(1)

    return "UNKNOWN"


def get_segment_number(text):

    match = re.search(
        r"Segment\s+(\d+)",
        str(text)
    )

    if match:
        return int(match.group(1))

    return None



def get_km_start(text):

    match = re.search(
        r"KM\s*(\d+)",
        str(text)
    )

    if match:
        return int(match.group(1))

    return None



def convert_risk(value):

    value = str(value).lower().strip()

    if value == "high":
        return "High"

    if value == "medium":
        return "Medium"

    if value == "low":
        return "Low"

    return "Medium"



def build_dataset():

    print("Loading datasets...")

    roads = pd.read_csv(ROAD_FILE)
    disasters = pd.read_csv(DISASTER_FILE)


    roads.columns = roads.columns.str.strip()
    disasters.columns = disasters.columns.str.strip()



    print("Preparing route information...")


    roads["route_code"] = roads[
        "Route/Segment Name"
    ].apply(get_route_code)


    roads["segment_number"] = roads[
        "Route/Segment Name"
    ].apply(get_segment_number)



    disasters["route_code"] = disasters[
        "Route Name"
    ].apply(get_route_code)


    disasters["km_start"] = disasters[
        "Route Name"
    ].apply(get_km_start)



    results = []


    exact_count = 0
    no_data_count = 0



    print("Building training dataset...")


    for _, d in disasters.iterrows():


        route = d["route_code"]


        selected = None

        match_type = None



        available_roads = roads[
            roads["route_code"] == route
        ]



        # Exact segment matching

        if len(available_roads) > 0:

            if d["km_start"] is not None:


                exact = available_roads[
                    available_roads["segment_number"]
                    ==
                    d["km_start"]
                ]


                if len(exact) > 0:

                    selected = exact.iloc[0]

                    match_type = "exact"

                    exact_count += 1



            # If route exists but segment not found

            if selected is None:

                selected = available_roads.iloc[0]

                match_type = "route-level"



        # No road information available

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
                "Unknown"

            }

            match_type = "no-road-data"

            no_data_count += 1



        results.append({

            "route_code":
            route,


            "route_name":
            d["Route Name"],


            "road_segment":
            selected["Route/Segment Name"],


            "gradient":
            selected["Max Gradient (%)"],


            "terrain":
            selected["Terrain Type"],


            "road_surface":
            selected["Road Surface Condition"],


            "elevation":
            selected["Average Elevation"],


            "friction":
            selected["Surface Friction Index"],


            "road_width":
            selected["Typical Road Width"],


            "hazard_type":
            d["Disaster/Risk Type"],


            "risk_factor":
            d["Primary Risk Factor"],


            "season":
            d["Month/Season of High Risk"],


            "historical_occurrence_count":
            d["Historical Occurrence Count"],


            "severity_level":
            d["Severity Level"],


            "risk_level":
            convert_risk(
                d["Severity Level"]
            ),


            "road_data_available":
            0 if match_type == "no-road-data" else 1,


            "match_type":
            match_type

        })



    final = pd.DataFrame(results)



    final.to_csv(
        OUTPUT_FILE,
        index=False
    )



    print("\nDataset created:")
    print(OUTPUT_FILE)


    print("\nTotal rows:")
    print(len(final))


    print("\nMatch summary:")
    print(
        final["match_type"].value_counts()
    )


    print("\nRisk distribution:")
    print(
        final["risk_level"].value_counts()
    )


    print("\nExact matches:")
    print(exact_count)


    print("\nNo road data:")
    print(no_data_count)




if __name__ == "__main__":

    build_dataset()