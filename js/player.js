import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const GAMEPAD_DEAD_ZONE = 0.15;

export class Player {
    constructor(camera, scene, roadBounds, isMobile = false) {
        this.camera = camera;
        this.scene = scene;
        this.roadBounds = roadBounds;
        this.isMobile = isMobile;

        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;

        // Mobile joystick state
        this.joystickInput = { x: 0, y: 0 };

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        // Player properties
        this.speed = 5.0;
        this.playerHeight = 1.7;
        this.collisionRadius = 0.5;
        this.nearMissRadius = 1.5;

        // Mobile look sensitivity
        this.lookSensitivity = 0.003;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

        this.gamepadIndex = -1;
        this.gamepadLookX = 0;
        this.gamepadLookY = 0;
        this.gamepadMoveX = 0;
        this.gamepadMoveY = 0;
        this.gamepadFlashlightPressed = false;
        this.gamepadLookSensitivity = 2.5;

        // Pointer lock controls (desktop only)
        if (!isMobile) {
            this.controls = new PointerLockControls(camera, document.body);
        }

        this.initGamepadListeners();
        this.init();
    }

    init() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Set initial position
        this.camera.position.set(0, this.playerHeight, 0);

        // Mobile touch controls
        if (this.isMobile) {
            this.setupMobileControls();
        }
    }

    initGamepadListeners() {
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadIndex = e.gamepad.index;
        });
        window.addEventListener('gamepaddisconnected', (e) => {
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = -1;
                this.gamepadMoveX = 0;
                this.gamepadMoveY = 0;
                this.gamepadLookX = 0;
                this.gamepadLookY = 0;
            }
        });
    }

    pollGamepad(deltaTime) {
        if (this.gamepadIndex < 0) return;
        const gamepads = navigator.getGamepads();
        const gp = gamepads[this.gamepadIndex];
        if (!gp) return;

        const applyDeadZone = (v) => Math.abs(v) < GAMEPAD_DEAD_ZONE ? 0 : v;

        this.gamepadMoveX = applyDeadZone(gp.axes[0]);
        this.gamepadMoveY = applyDeadZone(gp.axes[1]);
        this.gamepadLookX = applyDeadZone(gp.axes[2]);
        this.gamepadLookY = applyDeadZone(gp.axes[3]);

        if (this.gamepadLookX !== 0 || this.gamepadLookY !== 0) {
            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= this.gamepadLookX * this.gamepadLookSensitivity * deltaTime;
            this.euler.x -= this.gamepadLookY * this.gamepadLookSensitivity * deltaTime;
            this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        }

        const aButton = gp.buttons[0];
        if (aButton && aButton.pressed) {
            if (!this.gamepadFlashlightPressed) {
                this.gamepadFlashlightPressed = true;
                if (this.onFlashlightToggle) this.onFlashlightToggle();
            }
        } else {
            this.gamepadFlashlightPressed = false;
        }
    }

    setupMobileControls() {
        // Joystick
        const joystick = document.getElementById('joystick');
        const joystickKnob = document.getElementById('joystick-knob');

        if (joystick && joystickKnob) {
            let joystickActive = false;
            let joystickCenter = { x: 0, y: 0 };
            const maxDistance = 35;

            const handleJoystickStart = (e) => {
                e.preventDefault();
                joystickActive = true;
                const rect = joystick.getBoundingClientRect();
                joystickCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            };

            const handleJoystickMove = (e) => {
                if (!joystickActive) return;
                e.preventDefault();

                const touch = e.touches ? e.touches[0] : e;
                const dx = touch.clientX - joystickCenter.x;
                const dy = touch.clientY - joystickCenter.y;

                const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
                const angle = Math.atan2(dy, dx);

                const knobX = Math.cos(angle) * distance;
                const knobY = Math.sin(angle) * distance;

                joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

                // Normalize input
                this.joystickInput.x = knobX / maxDistance;
                this.joystickInput.y = -knobY / maxDistance; // Invert Y for forward
            };

            const handleJoystickEnd = () => {
                joystickActive = false;
                joystickKnob.style.transform = 'translate(0, 0)';
                this.joystickInput = { x: 0, y: 0 };
            };

            joystick.addEventListener('touchstart', handleJoystickStart, { passive: false });
            joystick.addEventListener('touchmove', handleJoystickMove, { passive: false });
            joystick.addEventListener('touchend', handleJoystickEnd);
            joystick.addEventListener('touchcancel', handleJoystickEnd);
        }

        // Look area (right side of screen)
        const lookArea = document.getElementById('look-area');
        if (lookArea) {
            let lastTouch = null;

            lookArea.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (e.touches.length > 0) {
                    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }
            }, { passive: false });

            lookArea.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!lastTouch || e.touches.length === 0) return;

                const touch = e.touches[0];
                const dx = touch.clientX - lastTouch.x;
                const dy = touch.clientY - lastTouch.y;

                // Update camera rotation
                this.euler.setFromQuaternion(this.camera.quaternion);
                this.euler.y -= dx * this.lookSensitivity;
                this.euler.x -= dy * this.lookSensitivity;

                // Clamp vertical look
                this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));

                this.camera.quaternion.setFromEuler(this.euler);

                lastTouch = { x: touch.clientX, y: touch.clientY };
            }, { passive: false });

            lookArea.addEventListener('touchend', () => {
                lastTouch = null;
            });
        }
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveForward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveBackward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveLeft = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveRight = true;
                break;
            case 'KeyF':
                // Flashlight toggle - will be handled by game
                if (this.onFlashlightToggle) {
                    this.onFlashlightToggle();
                }
                break;
        }
    }

    setFlashlightToggleCallback(callback) {
        this.onFlashlightToggle = callback;
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveForward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveBackward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveLeft = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveRight = false;
                break;
        }
    }

    lock() {
        if (this.controls) {
            this.controls.lock();
        }
    }

    unlock() {
        if (this.controls) {
            this.controls.unlock();
        }
    }

    isLocked() {
        // On mobile, always return true when playing
        if (this.isMobile) return true;
        return this.controls ? this.controls.isLocked : false;
    }

    getPosition() {
        return this.camera.position.clone();
    }

    getCollisionBox() {
        const pos = this.getPosition();
        return {
            minX: pos.x - this.collisionRadius,
            maxX: pos.x + this.collisionRadius,
            minZ: pos.z - this.collisionRadius,
            maxZ: pos.z + this.collisionRadius
        };
    }

    getNearMissBox() {
        const pos = this.getPosition();
        return {
            minX: pos.x - this.nearMissRadius,
            maxX: pos.x + this.nearMissRadius,
            minZ: pos.z - this.nearMissRadius,
            maxZ: pos.z + this.nearMissRadius
        };
    }

    update(deltaTime) {
        this.pollGamepad(deltaTime);

        if (!this.isMobile && !this.controls.isLocked && this.gamepadIndex < 0) return false;

        this.velocity.x -= this.velocity.x * 10.0 * deltaTime;
        this.velocity.z -= this.velocity.z * 10.0 * deltaTime;

        if (this.isMobile) {
            this.direction.z = this.joystickInput.y;
            this.direction.x = this.joystickInput.x;
        } else {
            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        }

        if (this.gamepadIndex >= 0) {
            if (this.gamepadMoveX !== 0) this.direction.x = this.gamepadMoveX;
            if (this.gamepadMoveY !== 0) this.direction.z = -this.gamepadMoveY;
        }

        const isMoving = this.direction.length() > 0.1;

        if (this.direction.length() > 0) {
            this.direction.normalize();
        }

        // Apply movement
        if (this.direction.z !== 0) {
            this.velocity.z -= this.direction.z * this.speed * deltaTime * 10;
        }
        if (this.direction.x !== 0) {
            this.velocity.x -= this.direction.x * this.speed * deltaTime * 10;
        }

        if (this.isMobile || (this.gamepadIndex >= 0 && (!this.controls || !this.controls.isLocked))) {
            const forward = new THREE.Vector3();
            const right = new THREE.Vector3();

            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

            this.camera.position.addScaledVector(forward, -this.velocity.z * deltaTime);
            this.camera.position.addScaledVector(right, -this.velocity.x * deltaTime);
        } else if (this.controls) {
            this.controls.moveRight(-this.velocity.x * deltaTime);
            this.controls.moveForward(-this.velocity.z * deltaTime);
        }

        // Clamp to road bounds
        this.camera.position.x = Math.max(
            this.roadBounds.minX,
            Math.min(this.roadBounds.maxX, this.camera.position.x)
        );
        this.camera.position.z = Math.max(
            this.roadBounds.minZ,
            Math.min(this.roadBounds.maxZ, this.camera.position.z)
        );

        // Keep at player height
        this.camera.position.y = this.playerHeight;

        return isMoving;
    }

    reset() {
        this.camera.position.set(0, this.playerHeight, 0);
        this.camera.rotation.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
    }
}
