const targetColors = ['green', 'purple', 'orange', 'cyan', 'magenta']; // List of colors for the target points, can expand or shrink as desired


/*
    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
    We add the various demographic intializations for our population here
*/
// Define demographic groups with their characteristics
const DEMOGRAPHICS = {
    YOUTH: {
        name: 'Youth',
        rMin: 0.15,     // Smaller minimum radius
        rMax: 0.6,      // Smaller maximum radius  
        vdMax: 2.0,     // Faster maximum velocity
        color: '#4CAF50',  // Green tint
        stressThreshold: 2,  // Lower stress tolerance
        crushThreshold: 2, // Lower crush threshold
        proportion: 0.2  // 20% of population
    },
    ADULT: {
        name: 'Adult',
        rMin: 0.2,      // Standard radius
        rMax: 0.8,      // Standard maximum radius
        vdMax: 1.5,     // Standard velocity
        color: '#2196F3',  // Blue tint
        stressThreshold: 3.0,  // Standard stress tolerance
        crushThreshold: 4,
        proportion: 0.6  // 60% of population
    },
    ELDERLY: {
        name: 'Elderly',
        rMin: 0.18,     // Slightly smaller radius
        rMax: 0.75,     // Slightly smaller max radius
        vdMax: 0.8,     // Much slower velocity
        color: '#FF9800',  // Orange tint
        stressThreshold: 2,  // Lower stress tolerance
        crushThreshold: 2,     // Lower crush threshold
        proportion: 0.2  // 20% of population
    }
};




/*
    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
    We modify particle class to have demographic-specific parameters
*/
// The particle/pedestrian
class Particle {
    constructor(x, y, demographic='ADULT') {
        this.x = x;
        this.y = y;

        // Use demographic-specific parameters
        this.demographic = demographic;
        this.demo = DEMOGRAPHICS[demographic];
        this.r = this.demo.rMin; 
        this.rMin = this.demo.rMin;
        this.rMax = this.demo.rMax;
        this.vdMax = this.demo.vdMax;

        this.vd = { x: 0, y: 0, magnitude: 0 };
        this.ve = { x: 0, y: 0, magnitude: 0 };
        this.targetIndex = -1; // Start with no target, will be determined dynamically
        this.inContact = false;
        this.reachedTarget = false;
        this.contacts = 0;          // Number of current contacts
        this.stress = 0;            // Accumulated stress
        this.dead = false;          // Death flag
    }
}

/*
    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
    We modify DeathMarker class to have demographic-specific death markers
*/
// Marker for the point of death of a particle
class DeathMarker {
    constructor(x, y, demographic) {
        this.x = x;
        this.y = y;
        this.demographic = demographic;
    }
}

// Target point for pedestrians
class Target {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}


// Used to create obstacles or walls
class Boundary {
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }
}

// Class for the actual model behavior itself
class ParticleModel {
    constructor(options = {}) {
        // Model parameters
        /*
            %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
            We modify ParticleModel class to have demographic-specific parameters
        */
        const minRadius = Math.min(...Object.values(DEMOGRAPHICS).map(d => d.rMin)); // Minimum radius (m), calculated based on most restrictive demographic
        this.rMax = options.rMax || 0.8; // Maximum radius (m)
        const maxVelocity = Math.max(...Object.values(DEMOGRAPHICS).map(d => d.vdMax)); // Maximum desired velocity (m/s), calculated based on most restrictive demographic
        // this.ve = this.vdMax; // Escape velocity magnitude (m/s)
        this.beta = options.beta || 1; // Exponent for velocity-radius relationship
        this.tau = options.tau || 0.5; // Time to reach maximum radius (s)
        this.dt = minRadius / (2 * maxVelocity); // Time step, calculated based on most restrictive demographic

        // Particle stress and death parameters
        this.stressRate = options.stressRate || 2.0;       // Stress accumulation per contact per second
        this.stressThreshold = options.stressThreshold || 8.0; // Stress needed for death
        this.crushThreshold = options.crushThreshold || 3;    // Minimum contacts for stress
        this.particlesDied = 0;                             // Death counter
        this.deathMarkers = [];

        // Lists for objects in the simulation
        this.particles = [];
        this.boundaries = [];
        this.targets = [];
        
        // Some metrics
        this.particlesReachedTarget = 0;
        this.totalParticlesCreated = 0;
        this.startTime = null;
        this.endTime = null;

        /*
            %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
            We modify ParticleModel class to have also track demographics
        */
        // Demographics tracking
        this.demographicStats = {};
        Object.keys(DEMOGRAPHICS).forEach(demo => {
            this.demographicStats[demo] = {
                created: 0,
                reachedTarget: 0,
                died: 0,
                current: 0
            };
        });
    }

    
    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify addParticle class to use/update demographic info
    */
    addParticle(x, y, demographic = 'ADULT') {
        this.particles.push(new Particle(x, y, demographic));
        this.totalParticlesCreated++;
        this.demographicStats[demographic].created++;
        this.demographicStats[demographic].current++;
    }
    

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify addParticle to addParticleWithDemographics according to the distributions we define
    */
    addParticlesWithDemographics(x, y, count = 1) {
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let demographic = 'ADULT'; // Initialize demographic
            let cumulative = 0;
            
            // This randomly samples the particle demographic according to the proportion we declared
            // Essentially, it splits a line from 0 to 1 up in slices, where if the randomly generated number
            // Lies in this slice, it is the demographic chosen for this particle
            for (const [demo, data] of Object.entries(DEMOGRAPHICS)) {
                cumulative += data.proportion; 
                if (rand <= cumulative) {
                    demographic = demo;
                    break;
                }
            }
            
            // Add some randomness to position
            const offsetX = (Math.random() - 0.5) * 0.5;
            const offsetY = (Math.random() - 0.5) * 0.5;
            this.addParticle(x + offsetX, y + offsetY, demographic);
        }
    }


    addTarget(x, y) {
        this.targets.push(new Target(x, y));
        return this.targets.length - 1;
    }

    addBoundary(x1, y1, x2, y2) {
        this.boundaries.push(new Boundary(x1, y1, x2, y2));
    }

    findClosestTargets() {
        for (const particle of this.particles) {
            let closestDistance = Infinity;
            let closestTargetIndex = -1;
        
            for (let i = 0; i < this.targets.length; i++) {
                const target = this.targets[i];
                const dx = target.x - particle.x;
                const dy = target.y - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < closestDistance) {
                closestDistance = distance;
                closestTargetIndex = i;
                }
            }
            particle.targetIndex = closestTargetIndex;
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify removeParticlesAtTarget to update demographic statistics
    */
    removeParticlesAtTarget() {
        const targetRadius = 0.5; // How close to target to consider "arrived" (in meters)
        this.particles = this.particles.filter(particle => {
        if (particle.targetIndex >= 0 && particle.targetIndex < this.targets.length) {
            const target = this.targets[particle.targetIndex];
            const dx = target.x - particle.x;
            const dy = target.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If particle reached target
            if (distance <= targetRadius) {
                this.particlesReachedTarget++;
                this.demographicStats[particle.demographic].reachedTarget++;
                this.demographicStats[particle.demographic].current--;

                // If this was the last particle, record end time
                if (this.particlesReachedTarget + this.particlesDied === this.totalParticlesCreated) {
                    this.endTime = performance.now();
                }

                return false; // Remove the particle
            }
        }
        return true; // Keep particles not at target yet
        });
    }

    // Calculate distance between a point and a boundary
    distanceToBoundary(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return {
            distance: Math.sqrt(dx * dx + dy * dy),
            point: { x: xx, y: yy }
        };
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify calculateDesiredVelocity to use particle demographic information
    */
    // Calculate desired velocity based on particle information (Equation 1)
    calculateDesiredVelocity(particle) {
        const normalizedRadius = (particle.r - particle.rMin) / (particle.rMax - particle.rMin);
        return particle.vdMax * Math.pow(normalizedRadius, this.beta);
    }

    // Find contacts and calculate escape velocity
    findContacts() {
        // Reset contact status
        for (const particle of this.particles) {
            particle.contacts = 0;
            particle.inContact = false;
            particle.ve = { x: 0, y: 0, magnitude: 0 };
        }

        // Check particle-particle contacts
        // Uncomment/comment this if you want/don't want particle collisions to affect movement direction
        for (let i = 0; i < this.particles.length; i++) {
            const pi = this.particles[i];

            // Check against other particles
            for (let j = i + 1; j < this.particles.length; j++) {
                const pj = this.particles[j];
                const dx = pi.x - pj.x;
                const dy = pi.y - pj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < pi.r + pj.r) {
                    // Contact detected
                    pi.inContact = true;
                    pj.inContact = true;

                    // Contacts counter for stress
                    pi.contacts++;
                    pj.contacts++;

                    // Calculate escape direction (Equation 7)
                    const eij = { x: dx / distance, y: dy / distance };
                   
                    // Velocity is escape direction PLUS current desired velocity
                    // This creates the effect where particles pushing from behind lose velocity
                    // and particles pushed forward gain velocity
                    pi.ve.x += eij.x + pi.vd.x;
                    pi.ve.y += eij.y + pi.vd.y;
                    pj.ve.x += -eij.x + pj.vd.x;
                    pj.ve.y += -eij.y + pj.vd.y;
                }
            }
        }

        // Check against boundaries
        for (const particle of this.particles) {
            for (const boundary of this.boundaries) {
                const result = this.distanceToBoundary(
                particle.x, particle.y,
                boundary.x1, boundary.y1,
                boundary.x2, boundary.y2
                );
                
                if (result.distance < particle.r) {
                    // Contact with boundary
                    particle.inContact = true;

                    /*
                    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
                    We increase the count for the number of contacts for the particle:
                    */
                    particle.contacts++;

                    // Calculate escape direction
                    const dx = particle.x - result.point.x;
                    const dy = particle.y - result.point.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // Normalize and add to escape velocity
                    if (distance > 0) {
                        particle.ve.x += dx / distance;
                        particle.ve.y += dy / distance;
                    }
                }
            }
        }

        /*
            %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
            We modify this for loop to use to use demographic information:
        */
        // Normalize escape velocities (Equation 6)
        for (const particle of this.particles) {
            if (particle.inContact) {
                const magnitude = Math.sqrt(particle.ve.x ** 2 + particle.ve.y ** 2);
                if (magnitude > 0) {
                    particle.ve.x = (particle.ve.x / magnitude) * particle.vdMax;
                    particle.ve.y = (particle.ve.y / magnitude) * particle.vdMax;
                    particle.ve.magnitude = particle.vdMax;
                }
            }
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify adjustRadii to use demographic information:
    */
    // Adjust radii according to the rules
    adjustRadii() {
        for (const particle of this.particles) {
            if (particle.inContact) {
                // Reduce radius to minimum when in contact
                particle.r = particle.rMin;
            } else {
                // Increase radius when not in contact (Equation 8)
                const dr = (particle.rMax / this.tau) * this.dt;
                particle.r = Math.min(particle.r + dr, particle.rMax);
            }
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify computeDesiredVelocities to use particle demographic information
    */
    // Compute desired velocities
    computeDesiredVelocities() {
        for (const particle of this.particles) {
            if (particle.targetIndex >= 0 && particle.targetIndex < this.targets.length) {
                const target = this.targets[particle.targetIndex];

                // Direction to target
                const dx = target.x - particle.x;
                const dy = target.y - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Compute desired velocity direction (Equation 5)
                if (distance > 0) {
                    // Magnitude based on radius (Equation 1)
                    const magnitude = this.calculateDesiredVelocity(particle); // use particle itself instead of particle.r
                    particle.vd.x = (dx / distance) * magnitude;
                    particle.vd.y = (dy / distance) * magnitude;
                    particle.vd.magnitude = magnitude;
                } else {
                    particle.vd = { x: 0, y: 0, magnitude: 0 };
                }
            }
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify updatePositions to use particle demographic information
    */
    // Update positions
    updatePositions() {
        for (const particle of this.particles) {
            let vx, vy;
            if (particle.r > particle.rMin) {
                // Use desired velocity if not at minimum radius
                vx = particle.vd.x;
                vy = particle.vd.y;
            } else {
                // Use escape velocity at minimum radius
                vx = particle.ve.x;
                vy = particle.ve.y;
            }

            // Update position
            particle.x += vx * this.dt;
            particle.y += vy * this.dt;
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify step to use particle demographic information
    */
    // Single simulation step
    step() {
        this.findContacts();
        this.adjustRadii();

        // Addition for death of particles
        for (const particle of this.particles) {
            const demo = particle.demo; // Get particle demographic

            // Only accumulate stress if above crush threshold
            if (particle.contacts >= demo.crushThreshold) {
                particle.stress += this.stressRate * this.dt;
            }
            
            // Reset stress if not under pressure
            else {
                particle.stress = Math.max(0, particle.stress - this.dt);
            }
    
            // Check for death
            if (particle.stress >= demo.stressThreshold) {
                particle.dead = true;
            }
        }
    
        // Remove dead particles, updated to track stats of demographic
        this.particles = this.particles.filter(particle => {
            if (particle.dead) {
                this.particlesDied++;
                this.demographicStats[particle.demographic].died++;
                this.demographicStats[particle.demographic].current--;
                this.deathMarkers.push(new DeathMarker(particle.x, particle.y, particle.demographic));
                return false;
            }
            return true;
        });

        this.findClosestTargets();
        this.computeDesiredVelocities();
        this.updatePositions();
        this.removeParticlesAtTarget();
    }

    
    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify reset to also reset demographic statistics
    */
    // Reset simulation
    reset() {
        this.particles = [];
        this.boundaries = [];
        this.targets = [];
        this.deathMarkers = [];
        this.particlesDied = 0;
        this.particlesReachedTarget = 0;
        this.totalParticlesCreated = 0;
        this.startTime = null;
        this.endTime = null;
        Object.keys(DEMOGRAPHICS).forEach(demo => {
            this.demographicStats[demo] = {
                created: 0,
                reachedTarget: 0,
                died: 0,
                current: 0
            };
        });
    }
}

// Class used to visualize
class SimulationRenderer {
    constructor(canvas, model, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.model = model;
        this.scale = options.scale || 100; // Pixels per meter
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBoundaries();
        this.drawTargets();
        this.drawParticles();
        this.drawDeathMarkers();
        this.updateStats(); // Update HTML stats
    }

    

    drawBoundaries() {
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        for (const boundary of this.model.boundaries) {
            this.ctx.moveTo(boundary.x1 * this.scale, boundary.y1 * this.scale);
            this.ctx.lineTo(boundary.x2 * this.scale, boundary.y2 * this.scale);
        }
        this.ctx.stroke();
    }

    drawTargets() {
        for (let i = 0; i < this.model.targets.length; i++) {
            const target = this.model.targets[i];
            // Use the corresponding color from targetColors array
            this.ctx.fillStyle = targetColors[i % targetColors.length];
            
            this.ctx.beginPath();
            this.ctx.arc(target.x * this.scale, target.y * this.scale, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify drawParticles to show the different demographics
    */
    drawParticles() {
        for (const particle of this.model.particles) {
            // Get target color for this particle
            const targetIndex = particle.targetIndex;
            const targetColor = targetIndex >= 0 ? targetColors[targetIndex % targetColors.length] : 'gray';

            
            const stressRatio = particle.stress / particle.demo.stressThreshold; // use demographic stress threshold
            // Blend demographic color with stress indication
            const baseColor = particle.demo.color;
            const stressAlpha = Math.min(stressRatio * 0.7, 0.7);
            const stressColor = particle.inContact ? 
                `rgba(255, 0, 0, ${0.3 + stressAlpha})` : 
                `rgba(0, 0, 255, ${0.3 + stressAlpha * 0.5})`;
            
            // Draw particle with demographic color as base
            this.ctx.fillStyle = baseColor;
            this.ctx.globalAlpha = 0.7;
            this.ctx.beginPath();
            this.ctx.arc(particle.x * this.scale, particle.y * this.scale, particle.r * this.scale, 0, Math.PI * 2);
            this.ctx.fill();

            // Overlay stress color
            this.ctx.fillStyle = stressColor;
            this.ctx.globalAlpha = stressAlpha;
            this.ctx.beginPath();
            this.ctx.arc(particle.x * this.scale, particle.y * this.scale, particle.r * this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;

            // Add a small colored dot to indicate target
            if (targetIndex >= 0) {
                this.ctx.fillStyle = targetColor;
                this.ctx.beginPath();
                this.ctx.arc(particle.x * this.scale, particle.y * this.scale, particle.r * this.scale * 0.3, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.drawVelocityVectors(particle);
        }
    }

    drawVelocityVectors(particle) {
        this.ctx.strokeStyle = 'green';
        this.ctx.beginPath();
        this.ctx.moveTo(particle.x * this.scale, particle.y * this.scale);
        this.ctx.lineTo(
            (particle.x + particle.vd.x * 0.5) * this.scale,
            (particle.y + particle.vd.y * 0.5) * this.scale
        );
        this.ctx.stroke();

        if (particle.inContact) {
            this.ctx.strokeStyle = 'red';
            this.ctx.beginPath();
            this.ctx.moveTo(particle.x * this.scale, particle.y * this.scale);
            this.ctx.lineTo(
                (particle.x + particle.ve.x * 0.5) * this.scale,
                (particle.y + particle.ve.y * 0.5) * this.scale
            );
            this.ctx.stroke();
        }
    }


    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify drawDeathMarkers to show the different demographics death markers
    */
    drawDeathMarkers() {
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 2;
        
        for (const marker of this.model.deathMarkers) {
            const x = marker.x * this.scale;
            const y = marker.y * this.scale;
            const size = 4; // Size of the cross
                    
            // Use demographic color for death marker
            this.ctx.strokeStyle = DEMOGRAPHICS[marker.demographic].color;
            this.ctx.lineWidth = 2;
            
            // Draw a cross
            this.ctx.beginPath();
            this.ctx.moveTo(x - size, y - size);
            this.ctx.lineTo(x + size, y + size);
            this.ctx.moveTo(x + size, y - size);
            this.ctx.lineTo(x - size, y + size);
            this.ctx.stroke();
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify updateStats to correctly update the statistics also for demographic
    */
    updateStats() {
        // Update HTML elements
        document.getElementById('particle-count').textContent = this.model.particles.length;
        document.getElementById('particles-reached').textContent = this.model.particlesReachedTarget;
        document.getElementById('time-step').textContent = this.model.dt.toFixed(3) + 's';
        document.getElementById('particles-died').textContent = this.model.particlesDied;
        // Update demographic statistics
        this.updateDemographicStats();
        
        if (this.model.startTime) {
            const currentTime = this.model.endTime || performance.now();
            const elapsedSeconds = (currentTime - this.model.startTime) / 1000;
            document.getElementById('elapsed-time').textContent = elapsedSeconds.toFixed(2) + 's';
            
            const completionElement = document.getElementById('completion-message');
            if (this.model.endTime) {
                const totalTime = (this.model.endTime - this.model.startTime) / 1000;
                completionElement.textContent = `All particles reached target/died in ${totalTime.toFixed(2)}s!`;
                completionElement.style.display = 'block';
            } else {
                completionElement.style.display = 'none';
            }
        } else {
            document.getElementById('elapsed-time').textContent = '0.00s';
            document.getElementById('completion-message').style.display = 'none';
        }
    }

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We create updateDemographicStats to handle all the updates for the demographics
    */
    updateDemographicStats() {
        // Create or update demographic display container
        let demographicContainer = document.getElementById('demographic-stats');
        if (!demographicContainer) {
            demographicContainer = document.createElement('div');
            demographicContainer.id = 'demographic-stats';
            demographicContainer.style.cssText = 'margin-top: 10px; font-family: Arial, sans-serif; font-size: 12px;';
            
            // Find a good place to insert it (after existing stats)
            const statsContainer = document.querySelector('.stats') || document.body;
            statsContainer.appendChild(demographicContainer);
        }
        
        // Build demographic stats HTML
        let demographicHTML = '<div style="font-weight: bold; margin-bottom: 5px;">Demographics:</div>';
        
        Object.entries(this.model.demographicStats).forEach(([demo, stats]) => {
            const demoData = DEMOGRAPHICS[demo];
            demographicHTML += `
                <div style="color: ${demoData.color}; margin-left: 10px; margin-bottom: 2px;">
                    ${demoData.name}: ${stats.current} 
                    (${stats.reachedTarget} reached, ${stats.died} died)
                </div>
            `;
        });
        
        demographicContainer.innerHTML = demographicHTML;
    }
}



// Controls the simulation and user interactions with buttons
class SimulationController {
    constructor(model, renderer, options = {}) {
        this.model = model;
        this.renderer = renderer;
        this.isPaused = true;
        this.animationId = null;
        this.lastFrameTime = null;
        this.speedFactor = options.speedFactor || 0.5;
    }

    start() {
        if (this.isPaused) {
        this.isPaused = false;
        this.model.startTime = performance.now();
        this.animate();
        }
    }

    pause() {
        this.isPaused = true;
        if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        }
    }

    reset() {
        this.pause();
        this.model.reset();
        this.renderer.render();
    }

    animate() {
        if (!this.isPaused) {
        const now = performance.now();
        if (!this.lastFrameTime) this.lastFrameTime = now;
        
        const elapsed = (now - this.lastFrameTime) / 1000;
        const stepsToTake = Math.floor(elapsed / (this.model.dt * this.speedFactor));
        
        for (let i = 0; i < stepsToTake; i++) {
            this.model.step();
        }
        
        if (stepsToTake > 0) this.lastFrameTime = now;
        
        this.renderer.render();
        this.animationId = requestAnimationFrame(() => this.animate());
        }
    }
}

// HTML Setup and Initialization
function setupSimulation() {
    const canvas = document.getElementById('simulation');
    canvas.width = 2000;
    canvas.height = 2000;

    const model = new ParticleModel({
        rMin: 0.2,
        rMax: 0.8,
        vdMax: 1.5,
        beta: 1,
        tau: 0.5,
        stressRate: 5.0,
        stressThreshold: 2,
        crushThreshold: 3
    });

    // Add boundaries
    model.addBoundary(1, 1, 15, 1); // Top horizontal
    model.addBoundary(1, 1, 1, 10); // Left vertical
    model.addBoundary(1, 10, 15, 10); // Bottom horizontal
    model.addBoundary(15, 1, 16, 3); // Top right hand side slanted wall
    model.addBoundary(15, 10, 16, 8); // Bottom right hand side slanted wall

    // Add targets
    model.addTarget(17, 3);
    model.addTarget(17, 8);

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We modify the particle creating loop to generate particles witht the
        different demographics
    */
    // Add particles
    for (let i = 0; i < 40; i++) {
        // Generate x and y coordinates within the boundaries
        const x = 2 + Math.random() * 12;
        const y = 2 + Math.random() * 7;
        model.addParticlesWithDemographics(x, y, 5); // Craetes 5 particles per call
    }

    model.findClosestTargets();

    const renderer = new SimulationRenderer(canvas, model, { scale: 100 });
    const simulation = new SimulationController(model, renderer, { speedFactor: 0.5 });

    // Set up controls
    const startButton = document.getElementById('start');
    const pauseButton = document.getElementById('pause');
    const resetButton = document.getElementById('reset');

    // Remove existing event listeners
    startButton.replaceWith(startButton.cloneNode(true));
    pauseButton.replaceWith(pauseButton.cloneNode(true));
    resetButton.replaceWith(resetButton.cloneNode(true));

    document.getElementById('start').addEventListener('click', () => simulation.start());
    document.getElementById('pause').addEventListener('click', () => simulation.pause());
    document.getElementById('reset').addEventListener('click', () => {
        simulation.reset();
        setupSimulation();
    });

    renderer.render();
    return simulation;
}

window.onload = setupSimulation;