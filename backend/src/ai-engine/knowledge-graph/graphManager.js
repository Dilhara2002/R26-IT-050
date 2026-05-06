const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * GraphRAG Reasoning Engine
 * This component combines ML model results with historical disaster 
 * and weather data (Knowledge Base) to generate explanations.
 */
class GraphManager {
    constructor() {
        this.disasterData = [];
        this.loadKnowledgeBase();
    }

    // Load the Knowledge Base (Disaster Data) from CSV file
    loadKnowledgeBase() {
        const filePath = path.join(__dirname, '../data/processed_disasters.csv');
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => this.disasterData.push(data))
            .on('end', () => {
                console.log('✅ GraphRAG Knowledge Base Loaded.');
            });
    }

    // Generate reasoning based on ML score and selected route
    getSafetyReasoning(route, mlScore) {
        // Find historical disaster data related to the given route
        const risks = this.disasterData.filter(d => d['Route Name'] === route);
        
        let reasoning = `The AI model predicted a safety score of ${mlScore}%. `;
        
        if (risks.length > 0) {
            reasoning += `Based on historical data, this route has risks such as ${risks[0]['Primary Risk Factor']} with a ${risks[0]['Severity Level']} severity level. `;
        } else {
            reasoning += "No major historical disaster risks were found for this route.";
        }

        return reasoning;
    }
}

module.exports = new GraphManager();