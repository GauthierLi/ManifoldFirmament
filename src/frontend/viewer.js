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
        
        // 窗口管理
        this.draggablePanels = [];
        this.snapDistance = 20; // 吸附距离（像素）
        this.activePanel = null;
        
        this.init();
        this.initDraggableWindows();
        this.initDataPanel();
        this.loadData();
        
        // 加载保存的面板位置
        setTimeout(() => this.loadPanelPositions(), 100);
    }
    
    initDraggableWindows() {
        // 初始化所有可拖动面板
        const panels = document.querySelectorAll('.draggable-panel');
        panels.forEach(panel => {
            this.makeDraggable(panel);
            this.draggablePanels.push(panel);
        });
        
        // 自动排版按钮（添加到控制面板）
        this.addLayoutButton();
    }
    
    makeDraggable(panel) {
        const header = panel.querySelector('.panel-header');
        if (!header) return;
        
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let snapIndicator = null;
        
        // 最小化按钮
        const minimizeBtn = panel.querySelector('.panel-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.classList.toggle('minimized');
                minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
            });
        }
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return; // 忽略按钮点击
            
            isDragging = true;
            this.activePanel = panel;
            
            // 记录初始位置
            startX = e.clientX;
            startY = e.clientY;
            startLeft = panel.offsetLeft;
            startTop = panel.offsetTop;
            
            // 提升当前面板层级
            this.draggablePanels.forEach(p => p.style.zIndex = 100);
            panel.style.zIndex = 200;
            
            document.body.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            panel.style.left = (startLeft + dx) + 'px';
            panel.style.top = (startTop + dy) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            
            // 显示吸附提示
            this.showSnapIndicator(panel, e.clientX, e.clientY);
        });
        
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            this.activePanel = null;
            document.body.style.cursor = 'default';
            
            // 移除吸附提示
            if (snapIndicator) {
                snapIndicator.remove();
                snapIndicator = null;
            }
            
            // 应用吸附
            this.applySnap(panel);
            
            // 保存位置
            this.savePanelPosition(panel);
        });
    }
    
    showSnapIndicator(panel, mouseX, mouseY) {
        // 移除旧的指示器
        const existing = document.querySelector('.snap-indicator');
        if (existing) existing.remove();
        
        const rect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let snapPos = null;
        
        // 检查边缘吸附
        if (rect.left < this.snapDistance) snapPos = { x: 0, y: rect.top, w: rect.width, h: rect.height, side: 'left' };
        else if (rect.right > viewportWidth - this.snapDistance) snapPos = { x: viewportWidth - rect.width, y: rect.top, w: rect.width, h: rect.height, side: 'right' };
        else if (rect.top < this.snapDistance) snapPos = { x: rect.left, y: 0, w: rect.width, h: rect.height, side: 'top' };
        else if (rect.bottom > viewportHeight - this.snapDistance - 60) snapPos = { x: rect.left, y: viewportHeight - rect.height - 60, w: rect.width, h: rect.height, side: 'bottom' };
        
        if (snapPos) {
            const indicator = document.createElement('div');
            indicator.className = 'snap-indicator';
            indicator.style.left = snapPos.x + 'px';
            indicator.style.top = snapPos.y + 'px';
            indicator.style.width = snapPos.w + 'px';
            indicator.style.height = snapPos.h + 'px';
            document.body.appendChild(indicator);
        }
    }
    
    applySnap(panel) {
        const rect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let newLeft = rect.left;
        let newTop = rect.top;
        
        // 边缘吸附
        if (rect.left < this.snapDistance) newLeft = 20;
        else if (rect.right > viewportWidth - this.snapDistance) newLeft = viewportWidth - rect.width - 20;
        
        if (rect.top < this.snapDistance) newTop = 20;
        else if (rect.bottom > viewportHeight - this.snapDistance - 60) newTop = viewportHeight - rect.height - 60;
        
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }
    
    savePanelPosition(panel) {
        const positions = {};
        this.draggablePanels.forEach(p => {
            positions[p.id] = {
                left: p.offsetLeft,
                top: p.offsetTop
            };
        });
        localStorage.setItem('panelPositions', JSON.stringify(positions));
    }
    
    loadPanelPositions() {
        const saved = localStorage.getItem('panelPositions');
        if (!saved) return;
        
        try {
            const positions = JSON.parse(saved);
            Object.keys(positions).forEach(id => {
                const panel = document.getElementById(id);
                if (panel && positions[id]) {
                    panel.style.left = positions[id].left + 'px';
                    panel.style.top = positions[id].top + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            });
        } catch (e) {
            console.error('加载面板位置失败:', e);
        }
    }
    
    autoLayout() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 预设布局位置
        const layouts = [
            { id: 'info-panel', left: 20, top: 20 },
            { id: 'data-panel', left: viewportWidth - 420, top: 20 },
            { id: 'log-panel', left: viewportWidth - 620, top: viewportHeight - 380 }
        ];
        
        layouts.forEach(layout => {
            const panel = document.getElementById(layout.id);
            if (panel) {
                panel.style.left = layout.left + 'px';
                panel.style.top = layout.top + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        });
        
        this.savePanelPosition(null);
    }
    
    addLayoutButton() {
        const controls = document.getElementById('controls');
        if (!controls) return;
        
        const btnLayout = document.createElement('button');
        btnLayout.id = 'btn-layout';
        btnLayout.textContent = '📐 自动排版';
        btnLayout.addEventListener('click', () => this.autoLayout());
        controls.appendChild(btnLayout);
    }
    
    initDataPanel() {
        // 日志面板初始化
        this.logAutoScroll = true;
        this.logInterval = null;
        this.initLogPanel();
        
        // 数据集选择
        const datasetSelect = document.getElementById('dataset-select');
        const fileUpload = document.getElementById('file-upload');
        const btnLoad = document.getElementById('btn-load');
        const statusMsg = document.getElementById('status-msg');
        const processing = document.getElementById('processing');
        
        // 互斥选择
        datasetSelect.addEventListener('change', () => {
            if (datasetSelect.value) {
                fileUpload.value = '';
            }
        });
        
        fileUpload.addEventListener('change', () => {
            if (fileUpload.files.length > 0) {
                datasetSelect.value = '';
            }
        });
        
        // 加载按钮
        btnLoad.addEventListener('click', async () => {
            const selectedDataset = datasetSelect.value;
            const uploadedFile = fileUpload.files[0];
            
            if (!selectedDataset && !uploadedFile) {
                this.showStatus('请选择数据集或上传文件', 'error');
                return;
            }
            
            this.setProcessing(true);
            this.clearLog();
            this.addLog('🚀 开始处理...', 'highlight');
            
            try {
                let formData = new FormData();
                
                if (uploadedFile) {
                    formData.append('file', uploadedFile);
                    formData.append('type', 'upload');
                } else {
                    formData.append('dataset', selectedDataset);
                    formData.append('type', 'preset');
                }
                
                const response = await fetch('/api/process', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.addLog('✅ 处理任务已启动，正在后台运行...', 'success');
                    this.startLogPolling();
                } else {
                    this.showStatus('❌ ' + result.error, 'error');
                    this.addLog('❌ ' + result.error, 'error');
                }
            } catch (error) {
                this.showStatus('❌ 处理失败：' + error.message, 'error');
                this.addLog('❌ ' + error.message, 'error');
            } finally {
                this.setProcessing(false);
            }
        });
    }
    
    initLogPanel() {
        const btnLogScroll = document.getElementById('btn-log-scroll');
        const btnLogClear = document.getElementById('btn-log-clear');
        const btnLogCollapse = document.getElementById('btn-log-collapse');
        const logPanel = document.getElementById('log-panel');
        
        btnLogScroll.addEventListener('click', () => {
            this.logAutoScroll = !this.logAutoScroll;
            btnLogScroll.classList.toggle('active', this.logAutoScroll);
        });
        
        btnLogClear.addEventListener('click', () => {
            this.clearLog();
        });
        
        btnLogCollapse.addEventListener('click', () => {
            logPanel.classList.toggle('collapsed');
            btnLogCollapse.textContent = logPanel.classList.contains('collapsed') ? '📏' : '📐';
        });
    }
    
    addLog(message, type = 'info') {
        const logContent = document.getElementById('log-content');
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        line.textContent = `[${timestamp}] ${message}`;
        
        logContent.appendChild(line);
        
        if (this.logAutoScroll) {
            logContent.scrollTop = logContent.scrollHeight;
        }
    }
    
    clearLog() {
        const logContent = document.getElementById('log-content');
        logContent.innerHTML = '';
    }
    
    startLogPolling() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
        }
        
        this.logInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/log');
                const result = await response.json();
                
                if (result.logs && result.logs.length > 0) {
                    result.logs.forEach(log => {
                        let type = 'info';
                        if (log.includes('✅') || log.includes('完成')) type = 'success';
                        else if (log.includes('❌') || log.includes('错误') || log.includes('Error')) type = 'error';
                        else if (log.includes('⚠️') || log.includes('Warning')) type = 'warning';
                        else if (log.includes('步骤') || log.includes('=')) type = 'highlight';
                        
                        this.addLog(log, type);
                    });
                }
                
                if (result.completed) {
                    clearInterval(this.logInterval);
                    this.addLog('🎉 处理完成！正在加载可视化...', 'success');
                    setTimeout(() => this.loadData(), 1500);
                }
            } catch (error) {
                console.error('日志轮询失败:', error);
            }
        }, 1000); // 每秒轮询一次
    }
    
    stopLogPolling() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }
    
    showStatus(message, type = '') {
        const statusMsg = document.getElementById('status-msg');
        statusMsg.textContent = message;
        statusMsg.className = type;
    }
    
    setProcessing(isProcessing) {
        const processing = document.getElementById('processing');
        const btnLoad = document.getElementById('btn-load');
        const processingText = document.getElementById('processing-text');
        
        if (isProcessing) {
            processing.style.display = 'block';
            btnLoad.disabled = true;
            processingText.textContent = '处理中，请稍候...（约 10-20 分钟）';
        } else {
            processing.style.display = 'none';
            btnLoad.disabled = false;
        }
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
            
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // 创建材质 - 简单方形点，小尺寸
        const material = new THREE.PointsMaterial({
            size: 2,  // 固定像素大小
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: false  // 禁用距离缩放，点大小固定
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
            // InstancedMesh 需要使用 raycaster.intersectInstances
            const intersects = this.raycaster.intersectObject(this.points);
            const tooltip = document.getElementById('tooltip');
            
            if (intersects.length > 0) {
                // InstancedMesh 的 instanceId 在 intersects[0].instanceId
                const index = intersects[0].instanceId;
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
