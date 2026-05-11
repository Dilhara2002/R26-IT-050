import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, GradientBoostingRegressor

DATASET_PATH = "package_quality_training_data.csv"
MODEL_PATH = "package_quality_model.pkl"

df = pd.read_csv(DATASET_PATH)

X = df[
    [
        "distanceScore",
        "timeFeasibility",
        "preferenceMatch",
        "graphStrength",
        "activityRelevance",
        "hotelSuitability",
        "foodCompatibility",
        "packageBalance",
    ]
]

y = df["qualityScore"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
)

models = {
    "Random Forest": RandomForestRegressor(
        n_estimators=600,
        max_depth=30,
        random_state=42,
        n_jobs=-1,
    ),

    "Extra Trees": ExtraTreesRegressor(
        n_estimators=600,
        max_depth=30,
        random_state=42,
        n_jobs=-1,
    ),

    "Gradient Boosting": GradientBoostingRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=4,
        random_state=42,
    ),
}

best_model = None
best_name = ""
best_r2 = -1

for name, model in models.items():
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(y_test, predictions) ** 0.5
    r2 = r2_score(y_test, predictions)

    print("\nMODEL:", name)
    print("MAE:", round(mae, 3))
    print("RMSE:", round(rmse, 3))
    print("R² Score:", round(r2, 4))

    if r2 > best_r2:
        best_r2 = r2
        best_model = model
        best_name = name

joblib.dump(best_model, MODEL_PATH)

print("\nBEST MODEL SAVED")
print("Best Model:", best_name)
print("Best R² Score:", round(best_r2, 4))
print("Saved As:", MODEL_PATH)

