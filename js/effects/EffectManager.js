class EffectManager {
    constructor() {
        this.canvas = document.getElementById('atmosphereCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentEffect = null;
        this.animationId = null;
        this.particles = [];
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.currentEffect && this.initEffectParticles) {
            this.initEffectParticles();
        }
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.particles = [];
        this.staticParticles = []; // Clear stars
        this.starsInitialized = false;
    }

    setEffect(effectName) {
        this.stop();
        // Rename 'shootingstars' to 'stars' internally if needed, or handle alias
        if (effectName === 'shootingstars') effectName = 'stars';

        this.currentEffect = effectName;

        if (!effectName || effectName === 'none' || effectName === 'dust') {
            this.canvas.style.display = 'none';
            return;
        }

        this.canvas.style.display = 'block';

        switch (effectName) {
            case 'snow':
                this.initSnow();
                this.animateSnow();
                break;
            case 'rain':
                this.initRain();
                this.animateRain();
                break;
            case 'leaves':
                this.initLeaves();
                this.animateLeaves();
                break;
            // Fog and Godrays removed
            case 'fireflies':
                this.initFireflies();
                this.animateFireflies();
                break;
            case 'stars':
                this.initStars();
                this.animateStars();
                break;

            case 'sakura':
                this.initSakura();
                this.animateSakura();
                break;
        }
    }

    // --- 1. SNOW ---
    initSnow() {
        this.particles = [];
        const particleCount = 100;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vy: 1 + Math.random() * 3,
                vx: (Math.random() - 0.5) * 2,
                r: 1 + Math.random() * 2,
                o: 0.5 + Math.random() * 0.5
            });
        }
        this.initEffectParticles = this.initSnow;
    }

    animateSnow() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#ffffff';

        this.ctx.beginPath();
        this.particles.forEach(p => {
            p.y += p.vy;
            p.x += p.vx;

            if (p.y > this.height) {
                p.y = -10;
                p.x = Math.random() * this.width;
            }

            this.ctx.moveTo(p.x + p.r, p.y);
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        });
        this.ctx.fill();

        this.animationId = requestAnimationFrame(() => this.animateSnow());
    }

    // --- 2. RAIN (Improved) ---
    initRain() {
        this.particles = [];
        this.splashes = []; // Use a separate array for splashes if we want
        const particleCount = 300; // Increased density
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vy: 15 + Math.random() * 10,
                length: 15 + Math.random() * 10,
                opacity: 0.2 + Math.random() * 0.3
            });
        }
        this.initEffectParticles = this.initRain;
    }

    animateRain() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.strokeStyle = '#8fb8e6';
        this.ctx.lineWidth = 1.5;

        // Draw Raindrops
        // Draw Raindrops in batches for performance
        this.ctx.globalAlpha = 0.3;
        this.ctx.beginPath();
        this.particles.forEach(p => {
            p.y += p.vy;
            p.x -= 0.5;

            if (p.y > this.height) {
                this.createSplash(p.x, this.height);
                p.y = -p.length;
                p.x = Math.random() * this.width;
            }

            if (p.x < 0) p.x = this.width;

            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p.x + 0.5, p.y + p.length);
        });
        this.ctx.stroke();

        // Draw Splashes
        this.updateSplashes();

        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animateRain());
    }

    createSplash(x, y) {
        // Create 2-3 small splash particles
        for (let i = 0; i < 2; i++) {
            this.splashes.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 4,
                vy: -(Math.random() * 3 + 1),
                life: 1.0
            });
        }
    }

    updateSplashes() {
        this.ctx.fillStyle = '#8fb8e6';
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            let s = this.splashes[i];
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.2; // Gravity
            s.life -= 0.1;

            if (s.life <= 0) {
                this.splashes.splice(i, 1);
            } else {
                this.ctx.globalAlpha = s.life * 0.5;
                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, 1, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    // --- 3. LEAVES ---
    initLeaves() {
        this.particles = [];
        const particleCount = 40;
        const colors = ['#efb334', '#e85f26', '#d64821', '#a83219'];
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: 8 + Math.random() * 8,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: -2 + Math.random() * 4,
                vy: 1 + Math.random() * 2,
                rotation: Math.random() * 360,
                rotationSpeed: -2 + Math.random() * 4,
                wobble: 0,
                wobbleSpeed: 0.02 + Math.random() * 0.05
            });
        }
        this.initEffectParticles = this.initLeaves;
    }

    animateLeaves() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.particles.forEach(p => {
            p.y += p.vy;
            p.x += p.vx + Math.sin(p.wobble) * 1;
            p.wobble += p.wobbleSpeed;
            p.rotation += p.rotationSpeed;

            if (p.y > this.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * this.width;
            }
            if (p.x > this.width + p.size) p.x = -p.size;
            if (p.x < -p.size) p.x = this.width + p.size;

            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, p.size / 2, p.size, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });

        this.animationId = requestAnimationFrame(() => this.animateLeaves());
    }

    // --- 4. FIREFLIES ---
    initFireflies() {
        this.particles = [];
        const particleCount = 40;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 1,
                vy: (Math.random() - 0.5) * 1,
                size: 2 + Math.random() * 2,
                glow: Math.random() * Math.PI * 2,
                glowSpeed: 0.05 + Math.random() * 0.05
            });
        }
        this.initEffectParticles = this.initFireflies;
    }

    animateFireflies() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.glow += p.glowSpeed;

            if (Math.random() < 0.02) p.vx = (Math.random() - 0.5) * 1;
            if (Math.random() < 0.02) p.vy = (Math.random() - 0.5) * 1;

            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;

            const opacity = 0.5 + Math.sin(p.glow) * 0.5;
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            gradient.addColorStop(0, `rgba(200, 255, 100, ${opacity})`);
            gradient.addColorStop(1, 'rgba(200, 255, 100, 0)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = `rgba(255, 255, 200, ${opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.animationId = requestAnimationFrame(() => this.animateFireflies());
    }

    // --- 5. STARS (Twinkling + Shooting Stars) ---
    initStars() {
        if (this.width <= 0 || this.height <= 0) {
            this.starsInitialized = false;
            return;
        }

        // Static Twinkling Stars
        this.staticParticles = [];
        const starCount = 200;
        for (let i = 0; i < starCount; i++) {
            this.staticParticles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: 0.5 + Math.random() * 1.5,
                alpha: Math.random(),
                alphaSpeed: 0.005 + Math.random() * 0.015, // Twinkle speed
                direction: Math.random() > 0.5 ? 1 : -1
            });
        }

        // Shooting Star Manager
        this.shootingStar = null;
        this.nextShootingStarTime = Date.now() + 1000;
        this.initEffectParticles = this.initStars;
        this.starsInitialized = true;
    }

    animateStars() {
        if (!this.starsInitialized || !this.staticParticles || this.staticParticles.length === 0) {
            // If stars were not initialized (e.g. width/height was 0), try to init now if possible
            if (this.width > 0 && this.height > 0) {
                this.initStars();
            }
            if (!this.starsInitialized) {
                this.animationId = requestAnimationFrame(() => this.animateStars());
                return;
            }
        }
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw Twinkling Stars
        // Draw Twinkling Stars in alpha batches for performance
        const alphaBatches = [[], [], [], []];
        this.staticParticles.forEach(p => {
            p.alpha += p.alphaSpeed * p.direction;
            if (p.alpha > 0.9) p.direction = -1;
            if (p.alpha < 0.2) p.direction = 1;

            const batchIdx = Math.max(0, Math.min(3, Math.floor(p.alpha * 4)));
            alphaBatches[batchIdx].push(p);
        });

        this.ctx.fillStyle = '#ffffff';
        alphaBatches.forEach((batch, i) => {
            if (batch.length === 0) return;
            this.ctx.globalAlpha = (i + 1) * 0.25;
            this.ctx.beginPath();
            batch.forEach(p => {
                this.ctx.moveTo(p.x + p.size, p.y);
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            });
            this.ctx.fill();
        });

        // Handle Shooting Star
        if (!this.shootingStar && Date.now() > this.nextShootingStarTime) {
            // Spawn new shooting star
            this.shootingStar = {
                x: Math.random() * this.width,
                y: Math.random() * (this.height * 0.6), // Upper 60% of screen
                len: 0,
                maxLen: 120 + Math.random() * 80,
                speed: 15 + Math.random() * 10,
                size: 1.5 + Math.random(),
                // Angle between 30 and 45 degrees
                angle: (Math.PI / 6) + Math.random() * (Math.PI / 6)
            };
        }

        if (this.shootingStar) {
            const s = this.shootingStar;
            s.x += Math.cos(s.angle) * s.speed;
            s.y += Math.sin(s.angle) * s.speed;
            if (s.len < s.maxLen) s.len += 4; // Grow tail

            // Gradient Tail
            const gradient = this.ctx.createLinearGradient(
                s.x, s.y,
                s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len
            );
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');

            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = s.size;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x, s.y);
            this.ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len);
            this.ctx.stroke();

            // Glowing Head
            this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size * 1.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Destroy if out of bounds
            if (s.x > this.width + s.len || s.y > this.height + s.len) {
                this.shootingStar = null;
                // Next star in random 3-8 seconds
                this.nextShootingStarTime = Date.now() + 3000 + Math.random() * 5000;
            }
        }

        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animateStars());
    }



    // --- 7. SAKURA ---
    initSakura() {
        this.particles = [];
        const particleCount = 40;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: 6 + Math.random() * 6,
                vx: 1 + Math.random() * 1,
                vy: 1 + Math.random() * 1,
                rotation: Math.random() * 360,
                rotationSpeed: -2 + Math.random() * 4,
                sway: 0,
                swaySpeed: 0.02 + Math.random() * 0.05
            });
        }
        this.initEffectParticles = this.initSakura;
    }

    animateSakura() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#ffb7c5'; // Sakura pink

        this.particles.forEach(p => {
            p.y += p.vy;
            p.x += p.vx + Math.sin(p.sway) * 0.5;
            p.sway += p.swaySpeed;
            p.rotation += p.rotationSpeed;

            if (p.y > this.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * this.width;
            }
            if (p.x > this.width + p.size) p.x = -p.size;

            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);

            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, p.size / 2, p.size, 0, 0, Math.PI * 2);
            this.ctx.moveTo(0, -p.size);
            this.ctx.lineTo(0, p.size);
            this.ctx.fill();
            this.ctx.restore();
        });

        this.animationId = requestAnimationFrame(() => this.animateSakura());
    }
}

// Global instance
window.effectManager = new EffectManager();
