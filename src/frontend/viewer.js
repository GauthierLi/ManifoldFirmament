/**
 * Three.js 3D 点云查看器
 * 
 * 功能：
 * - 加载可视化数据并渲染 3D 点云
 * - 支持旋转、缩放、平移
 * - 鼠标悬停显示图片信息
 * - 自动旋转、截图等功能
 */

class Viewer3D {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.data = null;
        this.autoRotate = true;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
        this.loadData();
    }
    
    init() {
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        // 创建相机
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 50);
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        // 添加轨道控制器
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0;
        
        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // 添加点光源
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(50, 50, 50);
        this.scene.add(pointLight);
        
        // 窗口大小调整
        window.addEventListener('resize', () => this.onResize());
        
        // 鼠标移动事件
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        // 开始渲染循环
        this.animate();
    }
    
    async loadData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('数据加载失败');
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            document.getElementById('loading').style.display = 'none';
            
        } catch (error) {
            console.error('加载数据失败:', error);
            document.getElementById('loading').innerHTML = `
                <p style="color: #ef4444;">❌ 数据加载失败</p>
                <p style="color: #9ca3af; font-size: 14px; margin-top: 10px;">
                    请先运行处理流水线生成数据<br>
                    <code>python src/main.py /path/to/paths.txt</code>
                </p>
            `;
        }
    }
    
    createPointCloud() {
        const points = this.data.points;
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        const sizes = new Float32Array(points.length);
        
        // 计算边界
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        points.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            
            colors[i * 3] = p.color[0];
            colors[i * 3 + 1] = p.color[1];
            colors[i * 3 + 2] = p.color[2];
            
            sizes[i] = 2.0;
            
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // 创建点材质
        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });
        
        // 创建点云
        this.points = new THREE.Points(geometry, material);
        this.points.userData = { pointsData: points };
        this.scene.add(this.points);
        
        // 调整相机位置
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        this.points.position.set(-centerX, -centerY, -centerZ);
        
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        this.camera.position.set(centerX, centerY, centerZ + maxDim * 1.5);
        this.controls.target.set(centerX, centerY, centerZ);
    }
    
    updateStats() {
        const meta = this.data.metadata;
        document.getElementById('stat-points').textContent = meta.n_points.toLocaleString();
        document.getElementById('stat-dim').textContent = meta.feature_dim;
        document.getElementById('stat-model').textContent = meta.model_version;
        document.getElementById('stat-neighbors').textContent = meta.umap_params.n_neighbors;
    }
    
    onMouseMove(event) {
        // 计算鼠标位置
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // 射线检测
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (this.points) {
            const intersects = this.raycaster.intersectObject(this.points);
            const tooltip = document.getElementById('tooltip');
            
            if (intersects.length > 0) {
                const index = intersects[0].index;
                const pointData = this.points.userData.pointsData[index];
                
                tooltip.style.display = 'block';
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
                tooltip.innerHTML = `
                    <div class="path">${pointData.image_path}</div>
                    <div class="index">索引：${pointData.original_index}</div>
                `;
                
                document.body.style.cursor = 'pointer';
            } else {
                tooltip.style.display = 'none';
                document.body.style.cursor = 'default';
            }
        }
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.autoRotate = this.autoRotate;
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    toggleRotate() {
        this.autoRotate = !this.autoRotate;
        document.getElementById('btn-rotate').classList.toggle('active', this.autoRotate);
    }
    
    resetView() {
        this.camera.position.set(0, 0, 50);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
    
    takeScreenshot() {
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.download = `screenshot_${new Date().getTime()}.png`;
        link.href = dataURL;
        link.click();
    }
}

// 初始化查看器
let viewer = null;

document.addEventListener('DOMContentLoaded', () => {
    viewer = new Viewer3D();
    
    // 绑定控制按钮
    document.getElementById('btn-rotate').addEventListener('click', () => {
        viewer.toggleRotate();
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        viewer.resetView();
    });
    
    document.getElementById('btn-screenshot').addEventListener('click', () => {
        viewer.takeScreenshot();
    });
});
