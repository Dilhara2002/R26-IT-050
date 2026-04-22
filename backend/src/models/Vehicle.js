const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    modelName: String,
    engineCC: Number,    
    maxPassengers: Number,
    fuelType: String,
    gradeability: Number, 
    category: { type: String, enum: ['SUV', 'Sedan', 'Hatchback', 'Bike'] }
});

module.exports = mongoose.model('Vehicle', vehicleSchema);