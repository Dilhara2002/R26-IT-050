import React, { useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const customIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

const LocationPicker = ({ position, setPosition, setCurrentLat, setCurrentLon }) => {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
            setCurrentLat(e.latlng.lat.toFixed(4));
            setCurrentLon(e.latlng.lng.toFixed(4));
        },
    });
    return position ? <Marker position={position} icon={customIcon} /> : null;
};

const ItineraryManager = () => {
    const [preferences, setPreferences] = useState([]);
    const [hours, setHours] = useState(2);
    const [minutes, setMinutes] = useState(30);
    const [currentLat, setCurrentLat] = useState('7.2906');
    const [currentLon, setCurrentLon] = useState('80.6337');
    const [radius, setRadius] = useState(15);
    const [mapPosition, setMapPosition] = useState({ lat: 7.2906, lng: 80.6337 });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const availablePreferences = ["History", "Nature", "Wildlife", "Culture", "Adventure", "City"];

    const handleCheckboxChange = (pref) => {
        if (preferences.includes(pref)) {
            setPreferences(preferences.filter(p => p !== pref));
        } else {
            setPreferences([...preferences, pref]);
        }
    };

    const handleOptimize = async () => {
        if (preferences.length === 0) {
            alert("Please select at least one preference.");
            return;
        }

        const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);

        if (totalMinutes < 30) {
            alert("Please allocate at least 30 minutes for the trip.");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post('http://192.168.1.7:8080/api/itinerary/optimize', {
                preferences: preferences,
                max_time_minutes: totalMinutes,
                current_lat: parseFloat(currentLat), 
                current_lon: parseFloat(currentLon),
                radius_km: parseFloat(radius)
            });
            setResult(response.data.data);
        } catch (error) {
            console.error("Optimization Error:", error);
            alert("Failed to fetch itinerary. Check if your servers are running.");
        }
        setLoading(false);
    };

    return (
        <div style={{ backgroundColor: '#f4f7f6', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
            <div style={{ maxWidth: '900px', margin: 'auto' }}>
                
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ color: '#1e293b', fontSize: '32px', fontWeight: '800', marginBottom: '10px' }}>Context-Aware Spatio-Temporal Optimizer</h1>
                    <p style={{ color: '#64748b', fontSize: '16px' }}>AI-Powered Smart Travel Planning System</p>
                </div>

                {/* Input Card */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                    
                    {/* Preferences */}
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#334155', fontSize: '18px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>✨ 1. Select Your Preferences</h3>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {availablePreferences.map(pref => (
                                <label key={pref} style={{ 
                                    cursor: 'pointer', 
                                    backgroundColor: preferences.includes(pref) ? '#3b82f6' : '#f1f5f9', 
                                    color: preferences.includes(pref) ? '#ffffff' : '#475569',
                                    padding: '10px 18px', 
                                    borderRadius: '30px', 
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease-in-out',
                                    boxShadow: preferences.includes(pref) ? '0 4px 6px rgba(59, 130, 246, 0.2)' : 'none'
                                }}>
                                    <input 
                                        type="checkbox" 
                                        checked={preferences.includes(pref)}
                                        onChange={() => handleCheckboxChange(pref)} 
                                        style={{ display: 'none' }}
                                    /> 
                                    {pref}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Time Limits */}
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#334155', fontSize: '18px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>⏱️ 2. Time Allocation</h3>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '5px' }}>HOURS</label>
                                <input type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} style={{ padding: '12px', width: '100px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '5px' }}>MINUTES</label>
                                <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ padding: '12px', width: '100px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                            </div>
                        </div>
                    </div>

                    {/* Map & Location */}
                    <div style={{ marginBottom: '30px' }}>
                        <h3 style={{ color: '#334155', fontSize: '18px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>📍 3. Starting Point & Range</h3>
                        <div style={{ height: '350px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '15px', zIndex: 0 }}>
                            <MapContainer center={[7.2906, 80.6337]} zoom={12} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                                <LocationPicker position={mapPosition} setPosition={setMapPosition} setCurrentLat={setCurrentLat} setCurrentLon={setCurrentLon} />
                            </MapContainer>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>LATITUDE</label>
                                <input type="text" value={currentLat} readOnly style={{ width: '100%', padding: '8px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', color: '#334155', fontWeight: '500' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>LONGITUDE</label>
                                <input type="text" value={currentLon} readOnly style={{ width: '100%', padding: '8px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', color: '#334155', fontWeight: '500' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>RADIUS (KM)</label>
                                <input type="number" min="1" value={radius} onChange={(e) => setRadius(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: '500', outline: 'none' }} />
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleOptimize} 
                        disabled={loading}
                        style={{ width: '100%', padding: '16px', backgroundColor: loading ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s', boxShadow: '0 4px 6px rgba(15, 23, 42, 0.2)' }}
                    >
                        {loading ? '⚙️ Optimizing Spatio-Temporal Route...' : '🚀 Generate Smart Itinerary'}
                    </button>
                </div>

                {/* Results Card */}
                {result && (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', borderTop: '6px solid #10b981' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
                            <h2 style={{ color: '#0f172a', margin: 0, fontSize: '24px', fontWeight: '800' }}>Your Optimized Route</h2>
                            <span style={{ backgroundColor: '#d1fae5', color: '#047857', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', border: '1px solid #34d399' }}>
                                ⏱️ {result.estimated_time_required}
                            </span>
                        </div>

                        {/* Beautiful Timeline style list */}
                        <div style={{ marginBottom: '30px', padding: '0 10px' }}>
                            {result.optimized_route.map((place, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '15px', backgroundColor: '#f8fafc', padding: '12px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ backgroundColor: '#10b981', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '15px', flexShrink: 0 }}>
                                        {index + 1}
                                    </div>
                                    <div style={{ fontSize: '16px', color: '#334155', fontWeight: '600' }}>
                                        {place}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* XAI Insights with Paragraph rendering */}
                        <div style={{ backgroundColor: '#f0fdfa', padding: '25px', borderRadius: '12px', border: '1px solid #5eead4' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                <span style={{ fontSize: '20px' }}>🤖</span>
                                <h4 style={{ margin: 0, color: '#0d9488', fontSize: '18px', fontWeight: '800' }}>Sub-Objectives: AI Insights</h4>
                            </div>
                            
                            <div style={{ 
                                color: '#115e59', 
                                fontSize: '15.5px', 
                                lineHeight: '1.8', 
                                whiteSpace: 'pre-line', /* THIS IS THE MAGIC LINE FOR PARAGRAPHS */
                                fontWeight: '500'
                            }}>
                                {result.ai_summary}
                            </div>
                            
                            <div style={{ textAlign: 'right', marginTop: '20px', borderTop: '1px dashed #99f6e4', paddingTop: '10px' }}>
                                <small style={{ color: '#0f766e', fontWeight: '700', letterSpacing: '0.5px' }}>GENERATED BY XAI TEXT-FORMATTER</small>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ItineraryManager;