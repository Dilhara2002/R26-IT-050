/**
 * පර්යේෂණ පදනම: වාහන එන්ජින් ධාරිතාව (CC) සහ මාර්ග බෑවුම (Gradient) අතර සම්බන්ධය.
 * [cite: 41, 63]
 */

const calculateSafetyScore = (engineCC, passengers, gradient, weather) => {
    let score = 100;

    // 1. Terrain Analysis (Gradient vs CC)
    // 800cc ට අඩු වාහන 15% ට වඩා වැඩි බෑවුම් වලදී අවදානම් සහගතයි [cite: 36, 78]
    if (gradient > 15 && engineCC < 1000) {
        score -= 30;
    } else if (gradient > 25 && engineCC < 1500) {
        score -= 20;
    }

    // 2. Load Factor (Passengers vs CC)
    // වැඩි පිරිසක් සිටින විට අඩු CC වාහන වල එන්ජිමට දැඩි පීඩනයක් ඇති වේ [cite: 59, 78]
    if (passengers > 4 && engineCC < 1200) {
        score -= 15;
    }

    // 3. Weather Awareness (Context-Aware Reasoning)
    // වැසි සහිත කාලගුණය සහ මීදුම කඳුකර මාර්ගවල ආරක්ෂාව අඩු කරයි [cite: 58, 82]
    const riskyWeather = ['Rain', 'Mist', 'Thunderstorm', 'Snow'];
    if (riskyWeather.includes(weather)) {
        score -= 25;
        
        // අතිශය අවදානම් තත්ත්වය: වැස්ස + අධික බෑවුම + අඩු CC
        if (gradient > 20 && engineCC < 1000) {
            score -= 20; 
        }
    }

    // 4. Score Normalization
    if (score < 0) score = 0;
    
    return score;
};

module.exports = { calculateSafetyScore };