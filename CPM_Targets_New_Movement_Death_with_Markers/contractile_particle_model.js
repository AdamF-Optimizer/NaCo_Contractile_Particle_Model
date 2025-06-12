const targetColors = ['green', 'purple', 'orange', 'cyan', 'magenta']; // List of colors for the target points, can expand or shrink as desired

// The particle/pedestrian
class Particle {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.r = radius;
        this.vd = { x: 0, y: 0, magnitude: 0 };
        this.ve = { x: 0, y: 0, magnitude: 0 };
        this.targetIndex = -1; // Start with no target, will be determined dynamically
        this.inContact = false;
        this.reachedTarget = false;
        /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We add the following to the particle class:
        */
        this.contacts = 0;          // Number of current contacts
        this.stress = 0;            // Accumulated stress
        this.dead = false;          // Death flag
    }
}

/*
%%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
We add the following DeathMarker class for qualitative analysis:
*/
// Marker for the point of death of a particle
class DeathMarker {
    constructor(x, y) {
        this.x = x;
        this.y = y;
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
        this.rMin = options.rMin || 0.2; // Minimum radius (m)
        this.rMax = options.rMax || 0.8; // Maximum radius (m)
        this.vdMax = options.vdMax || 1.5; // Maximum desired velocity (m/s)
        this.ve = this.vdMax; // Escape velocity magnitude (m/s)
        this.beta = options.beta || 1; // Exponent for velocity-radius relationship
        this.tau = options.tau || 0.5; // Time to reach maximum radius (s)
        this.dt = this.rMin / (2 * Math.max(this.vdMax, this.ve)); // Time step

        /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We add the following variables to model particle death:
        */
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
    }

    addParticle(x, y, radius = this.rMin) {
        this.particles.push(new Particle(x, y, radius));
        this.totalParticlesCreated++;
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

                /*
                    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
                    We add the number of dead particles to the number that reached the target,
                    to count if the simulation is finished:
                */
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

    // Calculate desired velocity based on radius (Equation 1)
    calculateDesiredVelocity(radius) {
        return this.vdMax * Math.pow((radius - this.rMin) / (this.rMax - this.rMin), this.beta);
    }

    // Find contacts and calculate escape velocity
    findContacts() {
        /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We also reset the number of particle contacts:
        */
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

                    /*
                    %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
                    We also add contacts counter:
                    */
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

        // Normalize escape velocities (Equation 6)
        for (const particle of this.particles) {
            if (particle.inContact) {
                const magnitude = Math.sqrt(particle.ve.x ** 2 + particle.ve.y ** 2);
                if (magnitude > 0) {
                    particle.ve.x = (particle.ve.x / magnitude) * this.ve;
                    particle.ve.y = (particle.ve.y / magnitude) * this.ve;
                    particle.ve.magnitude = this.ve;
                }
            }
        }
    }

    // Adjust radii according to the rules
    adjustRadii() {
        for (const particle of this.particles) {
            if (particle.inContact) {
                // Reduce radius to minimum when in contact
                particle.r = this.rMin;
            } else {
                // Increase radius when not in contact (Equation 8)
                const dr = (this.rMax / this.tau) * this.dt;
                particle.r = Math.min(particle.r + dr, this.rMax);
            }
        }
    }

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
                    const magnitude = this.calculateDesiredVelocity(particle.r);
                    particle.vd.x = (dx / distance) * magnitude;
                    particle.vd.y = (dy / distance) * magnitude;
                    particle.vd.magnitude = magnitude;
                } else {
                    particle.vd = { x: 0, y: 0, magnitude: 0 };
                }
            }
        }
    }

    // Update positions
    updatePositions() {
        for (const particle of this.particles) {
            let vx, vy;
            if (particle.r > this.rMin) {
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
        We add the step method from:
        // Single simulation step
        step() {
            this.findContacts();
            this.adjustRadii();
            this.findClosestTargets();
            this.computeDesiredVelocities();
            this.updatePositions();
            this.removeParticlesAtTarget();
        }

        to the following:
    */
    // Single simulation step
    step() {
        this.findContacts();
        this.adjustRadii();

        // Addition for death of particles
        for (const particle of this.particles) {
            // Only accumulate stress if above crush threshold
            if (particle.contacts >= this.crushThreshold) {
                particle.stress += this.stressRate * this.dt;
            }
            
            // Reset stress if not under pressure
            else {
                particle.stress = Math.max(0, particle.stress - this.dt);
            }
    
            // Check for death
            if (particle.stress >= this.stressThreshold) {
                particle.dead = true;
            }
        }
    
        // Remove dead particles
        this.particles = this.particles.filter(particle => {
            if (particle.dead) {
                this.particlesDied++;
                this.deathMarkers.push(new DeathMarker(particle.x, particle.y));
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
        We add resetting of deathmarkers etc..
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

    /*
        %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
        We add drawing death markers here
    */
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

    drawParticles() {
        for (const particle of this.model.particles) {
            // Get target color for this particle
            const targetIndex = particle.targetIndex;
            const targetColor = targetIndex >= 0 ? targetColors[targetIndex % targetColors.length] : 'gray';

            
            /*
                %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
                We add the following variables to get the stress levels visualized:
            */
            const stressRatio = particle.stress / this.model.stressThreshold;
            const baseColor = particle.inContact ? 'red' : 'blue';
            const stressColor = `rgba(255, ${255 - (stressRatio * 255)}, ${255 - (stressRatio * 255)}, 0.8)`;
            
            // Draw particle
            this.ctx.fillStyle = stressColor; // Use stress color
            this.ctx.beginPath();
            this.ctx.arc(particle.x * this.scale, particle.y * this.scale, particle.r * this.scale, 0, Math.PI * 2);
            this.ctx.fill();

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
        We add the following method to draw the death markers:
    */
    drawDeathMarkers() {
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 2;
        
        for (const marker of this.model.deathMarkers) {
            const x = marker.x * this.scale;
            const y = marker.y * this.scale;
            const size = 4; // Size of the cross
            
            // Draw a red cross
            this.ctx.beginPath();
            this.ctx.moveTo(x - size, y - size);
            this.ctx.lineTo(x + size, y + size);
            this.ctx.moveTo(x + size, y - size);
            this.ctx.lineTo(x - size, y + size);
            this.ctx.stroke();
        }
    }


    updateStats() {
        // Update HTML elements
        document.getElementById('particle-count').textContent = this.model.particles.length;
        document.getElementById('particles-reached').textContent = this.model.particlesReachedTarget;
        document.getElementById('time-step').textContent = this.model.dt.toFixed(3) + 's';
        document.getElementById('particles-died').textContent = this.model.particlesDied;
        
        
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
        rMax: 1.0,
        vdMax: 1.5,
        beta: 1,
        tau: 0.5,
        
        /*
            %%%%%%%%%%%%%%%%%%%%%%  MODIFICATION  %%%%%%%%%%%%%%%%%%%%%% 
            We add stress parameters:
        */
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

    // Add particles
    for (let i = 0; i < 200; i++) {
        model.addParticle(2 + Math.random() * 12, 2 + Math.random() * 7);
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