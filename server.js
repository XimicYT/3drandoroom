// --- Game Configuration ---
const CONFIG = {
    walkSpeed: 13.0,
    sprintSpeed: 30.0,
    jumpForce: 15.0,
    gravity: 35.0,
    playerHeight: 1.8,
    playerRadius: 0.5,
    mouseSensitivity: 0.002,
    staminaMax: 100,
    staminaDrain: 30,
    staminaRegen: 10,
    exhaustionThreshold: 30
};

// --- Globals ---
let camera, scene, renderer, socket;
let isLocked = false;
let isGameActive = false;

// Multiplayer State
const remotePlayers = {}; // Stores the 3D meshes of other players
let myId = "";

// Movement State
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isSprinting = false; 
let isExhausted = false; 

// Physics State
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let stamina = CONFIG.staminaMax;
let lastTime = performance.now();

// Collision Objects
const worldOctree = []; 
const playerCollider = new THREE.Box3();

// --- Login & Init ---
const loginScreen = document.getElementById('login-screen');
const playBtn = document.getElementById('play-btn');
const usernameInput = document.getElementById('username-input');

playBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim() || "Soldier";
    startGame(name);
});

function startGame(username) {
    loginScreen.style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('instructions').style.display = 'flex';
    
    // Connect to Backend
    socket = io();

    // Socket Events
    socket.on('connect', () => {
        myId = socket.id;
        socket.emit('setUsername', username);
    });

    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id !== myId) {
                addRemotePlayer(id, players[id]);
            }
        });
    });

    socket.on('newPlayer', (data) => {
        addRemotePlayer(data.id, data.player);
    });

    socket.on('playerMoved', (data) => {
        if (remotePlayers[data.id]) {
            remotePlayers[data.id].mesh.position.set(data.x, data.y, data.z);
            remotePlayers[data.id].mesh.rotation.y = data.rotation;
            
            // Update the collider for the remote player
            updateRemoteCollider(data.id);
        }
    });

    socket.on('updateName', (data) => {
        if (remotePlayers[data.id]) {
            // Update label logic here if we had 3D text
            // For now, console log
            console.log("Updated name:", data.username);
        }
    });

    socket.on('disconnectPlayer', (id) => {
        if (remotePlayers[id]) {
            scene.remove(remotePlayers[id].mesh);
            delete remotePlayers[id];
        }
    });

    init3D();
    animate();
    isGameActive = true;
}

function addRemotePlayer(id, data) {
    // Simple Cylinder Mesh for other players
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Helper Head to see rotation
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.8;
    head.position.z = -0.3; // Face forward
    mesh.add(head);

    mesh.position.set(data.x, data.y, data.z);
    
    // Add a collider box to this player for physics checks
    const box = new THREE.Box3();
    box.setFromObject(mesh);

    scene.add(mesh);
    
    remotePlayers[id] = {
        mesh: mesh,
        collider: box,
        username: data.username
    };
}

function updateRemoteCollider(id) {
    const p = remotePlayers[id];
    // Update the AABB collider to match the mesh's new position
    const r = CONFIG.playerRadius;
    const h = 1.8; // height
    const x = p.mesh.position.x;
    const y = p.mesh.position.y;
    const z = p.mesh.position.z;
    
    p.collider.min.set(x - r, y - h/2, z - r);
    p.collider.max.set(x + r, y + h/2, z + r);
}

function init3D() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 0, 60);

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ'; 
    camera.position.set(0, 5, 10); 

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. Build Level
    buildLevel();

    // 6. Event Listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
    
    // Pointer Lock
    const instructions = document.getElementById('instructions');
    instructions.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === document.body;
        instructions.style.display = isLocked ? 'none' : 'flex';
    });
}

function buildLevel() {
    const materialFloor = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const materialBox = new THREE.MeshStandardMaterial({ color: 0x00ffcc, roughness: 0.2 });
    const materialWall = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.5 });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floor = new THREE.Mesh(floorGeo, materialFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Floor Collision
    const floorBox = new THREE.Box3();
    floorBox.setFromObject(floor);
    floorBox.min.y = -1;
    floorBox.max.y = 0;
    worldOctree.push(floorBox);

    // Helper
    function addBlock(x, y, z, w, h, d, mat) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h/2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const box = new THREE.Box3();
        box.setFromObject(mesh);
        worldOctree.push(box);
    }

    // Level Objects
    addBlock(0, 0, -10, 10, 2, 2, materialWall);
    addBlock(-8, 0, -5, 4, 1, 4, materialBox);
    addBlock(8, 0, -5, 4, 3, 4, materialBox);
    for(let i=0; i<6; i++) {
        addBlock(-5, i*0.5, 5 + i*2, 4, 0.5, 2, materialBox);
    }
    addBlock(-5, 3, 20, 6, 0.2, 6, materialWall);
}

function onMouseMove(event) {
    if (!isLocked) return;
    camera.rotation.y -= event.movementX * CONFIG.mouseSensitivity;
    camera.rotation.x -= event.movementY * CONFIG.mouseSensitivity;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'ShiftLeft': isSprinting = true; break;
        case 'Space':
            if (canJump) {
                velocity.y = CONFIG.jumpForce;
                canJump = false;
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': isSprinting = false; break;
    }
}

function onWindowResize() {
    if(camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

function updatePlayer(delta) {
    direction.set(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

    if (moveForward) direction.add(forward);
    if (moveBackward) direction.sub(forward);
    if (moveRight) direction.add(right);
    if (moveLeft) direction.sub(right);
    
    direction.normalize();

    // Stamina Logic
    let currentSpeed = CONFIG.walkSpeed;
    const isMoving = moveForward || moveBackward || moveLeft || moveRight;

    if (isSprinting && isMoving && !isExhausted && stamina > 0) {
        currentSpeed = CONFIG.sprintSpeed;
        stamina -= CONFIG.staminaDrain * delta;
        
        if (stamina <= 0) {
            stamina = 0;
            isExhausted = true; 
        }
    } else {
        if (stamina < CONFIG.staminaMax) {
            stamina += CONFIG.staminaRegen * delta;
        }
        if (isExhausted && stamina >= CONFIG.exhaustionThreshold) {
            isExhausted = false; 
        }
    }

    // UI Update
    const staminaPct = (stamina / CONFIG.staminaMax) * 100;
    const bar = document.getElementById('stamina-bar-fill');
    if(bar) {
        bar.style.width = `${staminaPct}%`;
        if (isExhausted) bar.style.background = '#888888';
        else if (stamina < 30) bar.style.background = '#ff3333';
        else bar.style.background = 'linear-gradient(90deg, #00ffcc, #0099ff)';
    }

    // Physics
    if (isMoving) {
        velocity.x += direction.x * currentSpeed * delta * 8; 
        velocity.z += direction.z * currentSpeed * delta * 8;
    }
    
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= CONFIG.gravity * delta;

    // --- COLLISION LOGIC ---

    // X Movement
    camera.position.x += velocity.x * delta;
    updateCollider();
    if (checkCollisions() || checkPlayerCollisions()) {
        camera.position.x -= velocity.x * delta;
        velocity.x = 0;
    }

    // Z Movement
    camera.position.z += velocity.z * delta;
    updateCollider();
    if (checkCollisions() || checkPlayerCollisions()) {
        camera.position.z -= velocity.z * delta;
        velocity.z = 0;
    }

    // Y Movement
    camera.position.y += velocity.y * delta;
    updateCollider();
    // Only check world collisions for Y (don't stand on players heads for now to avoid bugs)
    const hit = checkCollisions();
    
    if (hit) {
        if (velocity.y < 0) {
            camera.position.y -= velocity.y * delta;
            velocity.y = 0;
            canJump = true;
        } else {
            camera.position.y -= velocity.y * delta;
            velocity.y = 0;
        }
    }

    if (camera.position.y < -10) {
        velocity.set(0, 0, 0);
        camera.position.set(0, 5, 10);
    }

    // Send data to server
    if (socket && isMoving) {
        socket.emit('playerMovement', {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            rotation: camera.rotation.y
        });
    }
}

function updateCollider() {
    const r = CONFIG.playerRadius;
    const h = CONFIG.playerHeight;
    const x = camera.position.x;
    const y = camera.position.y;
    const z = camera.position.z;
    playerCollider.min.set(x - r, y - h, z - r);
    playerCollider.max.set(x + r, y, z + r);
}

// Check collision with Static World
function checkCollisions() {
    for (let box of worldOctree) {
        if (playerCollider.intersectsBox(box)) {
            return box;
        }
    }
    return null;
}

// Check collision with Other Players
function checkPlayerCollisions() {
    for (let id in remotePlayers) {
        const p = remotePlayers[id];
        if (playerCollider.intersectsBox(p.collider)) {
            return true;
        }
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1); 
    lastTime = time;

    if (isGameActive && isLocked) {
        updatePlayer(delta);
    }
    renderer.render(scene, camera);
}
