/**
 * Intelligent Safety Logic Engine for Sri Lankan Terrain
 * Developed for Student ID: IT22555458
 */

export const calculateSafetyScore = (vehicleCC, passengers, roadGradient) => {
  // 1. Power Factor Calculation (වාහනයේ මූලික බලය)
  // සාමාන්‍යයෙන් 1000cc වාහනයක් 10% බෑවුමක මගීන් දෙදෙනෙකු සමඟ ස්ථාවරයි කියා උපකල්පනය කරමු.
  const basePower = vehicleCC / 100; 

  // 2. Load Factor (මගීන්ගේ බරෙහි බලපෑම)
  // එක් මගියෙක් සාමාන්‍යයෙන් 75kg ලෙස සලකා බලය 0.8 කින් අඩු කරනවා
  const passengerImpact = passengers * 0.8;

  // 3. Maximum Allowable Gradient (වාහනයට ඔරොත්තු දෙන උපරිම බෑවුම)
  // සූත්‍රය: (Base Power - Load Impact) * constant
  const maxSlopeCapability = (basePower - passengerImpact) * 1.5;

  // 4. Safety Assessment (ආරක්ෂාව තීරණය කිරීම)
  let status = "SAFE";
  let color = "#4CAF50"; // Green
  let reason = "Vehicle has optimal power-to-weight ratio for this route.";
  
  // පාරේ බෑවුම සහ වාහනයේ උපරිම හැකියාව අතර පරතරය (Gap)
  const riskGap = roadGradient - maxSlopeCapability;

  if (riskGap > 5) {
    status = "UNSAFE";
    color = "#F44336"; // Red
    reason = `Danger: ${vehicleCC}cc engine is insufficient for a ${roadGradient}% incline with ${passengers} passengers. High risk of traction loss.`;
  } else if (riskGap > 0) {
    status = "CAUTION";
    color = "#FF9800"; // Orange
    reason = "Caution: Significant engine strain detected. Proceed only in low gears (L1/L2) and avoid heavy braking.";
  }

  // 5. Safety Percentage (0 - 100 range)
  const safetyPercentage = Math.max(0, Math.min(100, 100 - (riskGap * 12)));

  return {
    status,
    color,
    reason,
    safetyPercentage: safetyPercentage.toFixed(0),
    maxSlope: maxSlopeCapability.toFixed(1)
  };
};