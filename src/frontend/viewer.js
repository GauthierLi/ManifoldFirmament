/**
 * Three.js 3D 点云查看器
 * 
 * 功能：
 * - 加载可视化数据并渲染 3D 点云
 * - 支持旋转、缩放、平移
 * - 点击选点显示邻居图片卡片
 * - 自动旋转、截图等功能
 */

// ============================================================
// DraggablePanel - 统一的可拖动面板类
// ============================================================
class DraggablePanel {
    static instances = [];
    static snapDistance = 20;
    static activePanel = null;  // 当前正在拖动的面板

    /**
     * @param {HTMLElement} element - 面板 DOM 元素（需包含 .panel-header 子元素作为拖拽手柄）
     * @param {Object} options
     * @param {boolean} options.saveable - 是否持久化位置到 localStorage（默认 true）
     */
    constructor(element, options = {}) {
        this.element = element;
        this.saveable = options.saveable !== false;
        this._isDragging = false;
        this._isResizing = false;
        this._startX = 0;
        this._startY = 0;
        this._startLeft = 0;
        this._startTop = 0;
        this._resizeStartW = 0;
        this._resizeStartH = 0;

        this._bindEvents();
        this._initResize();
        DraggablePanel.instances.push(this);
    }

    _bindEvents() {
        const header = this.element.querySelector('.panel-header');
        if (!header) return;

        // 最小化按钮
        const minimizeBtn = this.element.querySelector('.panel-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.element.classList.toggle('minimized');
                minimizeBtn.textContent = this.element.classList.contains('minimized') ? '+' : '−';
            });
        }

        // 拖拽开始
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;

            this._isDragging = true;
            DraggablePanel.activePanel = this;

            const rect = this.element.getBoundingClientRect();
            this._startX = e.clientX;
            this._startY = e.clientY;
            this._startLeft = rect.left;
            this._startTop = rect.top;

            // 统一切换到 left/top 绝对定位
            this.element.style.left = rect.left + 'px';
            this.element.style.top = rect.top + 'px';
            this.element.style.right = 'auto';
            this.element.style.bottom = 'auto';
            this.element.style.transform = 'none';

            // 提升当前面板层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // 统一的 mousemove / mouseup（拖拽 + 缩放共用）
        this._onMouseMove = (e) => {
            if (this._isDragging) {
                const dx = e.clientX - this._startX;
                const dy = e.clientY - this._startY;
                this.element.style.left = (this._startLeft + dx) + 'px';
                this.element.style.top = (this._startTop + dy) + 'px';
                this._showSnapIndicator();
            }
            if (this._isResizing) {
                const newW = this._resizeStartW + (e.clientX - this._startX);
                const newH = this._resizeStartH + (e.clientY - this._startY);
                this.element.style.width = Math.max(150, newW) + 'px';
                this.element.style.height = Math.max(80, newH) + 'px';
                this.element.style.maxWidth = 'none';
                this.element.style.maxHeight = 'none';
            }
        };

        this._onMouseUp = () => {
            if (this._isDragging) {
                this._isDragging = false;
                DraggablePanel.activePanel = null;
                const indicator = document.querySelector('.snap-indicator');
                if (indicator) indicator.remove();
                this._applySnap();
                if (this.saveable) DraggablePanel.savePositions();
            }
            if (this._isResizing) {
                this._isResizing = false;
                DraggablePanel.activePanel = null;
            }
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _initResize() {
        const handle = document.createElement('div');
        handle.className = 'panel-resize-handle';
        this.element.appendChild(handle);

        handle.addEventListener('mousedown', (e) => {
            this._isResizing = true;
            DraggablePanel.activePanel = this;

            this._startX = e.clientX;
            this._startY = e.clientY;
            this._resizeStartW = this.element.offsetWidth;
            this._resizeStartH = this.element.offsetHeight;

            // 提升层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'nwse-resize';
            e.preventDefault();
            e.stopPropagation();
        });
    }

    _showSnapIndicator() {
        const existing = document.querySelector('.snap-indicator');
        if (existing) existing.remove();

        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let snapPos = null;

        if (rect.left < sd)
            snapPos = { x: 0, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.right > vw - sd)
            snapPos = { x: vw - rect.width, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.top < sd)
            snapPos = { x: rect.left, y: 0, w: rect.width, h: rect.height };
        else if (rect.bottom > vh - sd - 60)
            snapPos = { x: rect.left, y: vh - rect.height - 60, w: rect.width, h: rect.height };

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

    _applySnap() {
        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let newLeft = rect.left;
        let newTop = rect.top;

        if (rect.left < sd) newLeft = 20;
        else if (rect.right > vw - sd) newLeft = vw - rect.width - 20;

        if (rect.top < sd) newTop = 20;
        else if (rect.bottom > vh - sd - 60) newTop = vh - rect.height - 60;

        this.element.style.left = newLeft + 'px';
        this.element.style.top = newTop + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
    }

    destroy() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        const handle = this.element.querySelector('.panel-resize-handle');
        if (handle) handle.remove();
        const idx = DraggablePanel.instances.indexOf(this);
        if (idx !== -1) DraggablePanel.instances.splice(idx, 1);
    }

    // ---- 静态方法：全局位置管理 ----

    static savePositions() {
        const positions = {};
        DraggablePanel.instances.forEach(p => {
            if (p.saveable && p.element.id) {
                positions[p.element.id] = {
                    left: p.element.offsetLeft,
                    top: p.element.offsetTop
                };
            }
        });
        localStorage.setItem('panelPositions', JSON.stringify(positions));
    }

    static loadPositions() {
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
}

// ============================================================
// Viewer3D - 3D 点云查看器
// ============================================================
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
        
        // 点选交互
        this.selectedPointIndex = null;
        this.neighborRadius = 5.0;
        this.originalColors = null;
        this.pickMode = false;
        this._imageObserver = null;
        
        this.init();
        this.initDraggableWindows();
        this.initSelectionCard();
        this.initDataPanel();
        
        this.loadExistingData();
        
        setTimeout(() => DraggablePanel.loadPositions(), 100);
    }
    
    initDraggableWindows() {
        // 为所有静态面板创建 DraggablePanel 实例
        document.querySelectorAll('.draggable-panel').forEach(panel => {
            new DraggablePanel(panel);
        });
        
        this.addLayoutButton();
    }
    
    autoLayout() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
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
        
        DraggablePanel.savePositions();
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
        console.log('初始化数据面板...');
        
        this.logAutoScroll = true;
        this.logInterval = null;
        this.initLogPanel();
        
        console.log('初始化点选交互...');
        this.initPointSelection();
        
        const datasetSelect = document.getElementById('dataset-select');
        const fileUpload = document.getElementById('file-upload');
        const btnLoad = document.getElementById('btn-load');
        
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
                    if (result.skipped) {
                        this.addLog('✅ ' + result.message, 'success');
                        setTimeout(() => this.loadDataByFilename(result.output), 1000);
                    } else {
                        this.addLog('✅ 处理任务已启动，正在后台运行...', 'success');
                        this.startLogPolling(result.output);
                    }
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
    
    // ---- 采点卡片：初始化时创建，始终可见 ----
    
    initSelectionCard() {
        const card = document.createElement('div');
        card.id = 'selection-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>🖼️ 相邻图片</span>
                <div style="display:flex;gap:4px;">
                    <button id="btn-pick" title="采点工具">🔍</button>
                    <button id="btn-clear-pick" title="清除选择">🗑️</button>
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content">
                <div class="card-radius-control">
                    <label>半径：<span id="radius-value">${this.neighborRadius.toFixed(1)}</span></label>
                    <input type="range" id="radius-slider" min="0.5" max="20" step="0.5" value="${this.neighborRadius}">
                </div>
                <div class="card-images" id="card-images">
                    <span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        
        new DraggablePanel(card, { saveable: false });
        
        // 采点工具开关
        document.getElementById('btn-pick').addEventListener('click', () => {
            this.togglePickMode();
        });
        
        // 清除选择
        document.getElementById('btn-clear-pick').addEventListener('click', () => {
            this.deselectPoint();
        });
        
        // 半径滑块
        document.getElementById('radius-slider').addEventListener('input', (e) => {
            this.neighborRadius = parseFloat(e.target.value);
            document.getElementById('radius-value').textContent = this.neighborRadius.toFixed(1);
            
            if (this.selectedPointIndex !== null) {
                const neighbors = this.findNeighbors(this.selectedPointIndex, this.neighborRadius);
                this.updateSelectionImages(neighbors);
                this.updatePointColors(neighbors);
            }
        });
    }
    
    togglePickMode() {
        this.pickMode = !this.pickMode;
        
        const btn = document.getElementById('btn-pick');
        btn.classList.toggle('active', this.pickMode);
        
        // 切换画布光标
        document.getElementById('canvas-container').classList.toggle('pick-mode', this.pickMode);
    }
    
    // ---- 点击交互：仅在采点模式下生效 ----
    
    initPointSelection() {
        this.renderer.domElement.addEventListener('click', (e) => {
            if (DraggablePanel.activePanel) return;
            if (!this.pickMode) return;
            if (e.target.closest('#selection-card')) return;
            
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            if (this.points) {
                const intersects = this.raycaster.intersectObject(this.points);
                
                if (intersects.length > 0) {
                    const index = intersects[0].instanceId !== undefined ? 
                                  intersects[0].instanceId : intersects[0].index;
                    this.selectPoint(index);
                }
                // 点击空白处不取消选择，避免误触
            }
        });
        
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    selectPoint(index) {
        this.selectedPointIndex = index;
        
        const neighbors = this.findNeighbors(index, this.neighborRadius);
        this.updateSelectionImages(neighbors);
        this.updatePointColors(neighbors);
    }
    
    findNeighbors(centerIndex, radius) {
        const centerPoint = this.points.userData.pointsData[centerIndex];
        const neighbors = [centerIndex];
        
        this.points.userData.pointsData.forEach((p, i) => {
            if (i === centerIndex) return;
            
            const dx = p.x - centerPoint.x;
            const dy = p.y - centerPoint.y;
            const dz = p.z - centerPoint.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance <= radius) {
                neighbors.push(i);
            }
        });
        
        return neighbors;
    }
    
    updateSelectionImages(neighborIndices) {
        const imagesContainer = document.getElementById('card-images');
        if (!imagesContainer) return;
        
        // 清理旧的 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
        }
        
        imagesContainer.innerHTML = '';
        
        neighborIndices.forEach(idx => {
            const p = this.points.userData.pointsData[idx];
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'neighbor-image-wrapper';
            
            // 懒加载：先不设 src，用 data-src 暂存
            const img = document.createElement('img');
            img.dataset.src = '/api/image?path=' + encodeURIComponent(p.image_path);
            img.alt = `Image ${p.original_index}`;
            img.title = p.image_path;
            img.onerror = () => {
                imgWrapper.style.background = '#333';
                imgWrapper.textContent = `点 ${p.original_index}`;
            };
            
            imgWrapper.appendChild(img);
            imagesContainer.appendChild(imgWrapper);
        });
        
        // 用 IntersectionObserver 按需加载可见区域的图片
        this._imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                        this._imageObserver.unobserve(img);
                    }
                }
            });
        }, {
            root: imagesContainer,    // 以滚动容器为视口
            rootMargin: '0px 300px',  // 提前 300px 预加载
            threshold: 0
        });
        
        imagesContainer.querySelectorAll('img[data-src]').forEach(img => {
            this._imageObserver.observe(img);
        });
    }
    
    updatePointColors(neighborIndices) {
        const neighborSet = new Set(neighborIndices);
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        
        for (let i = 0; i < colors.count; i++) {
            if (neighborSet.has(i)) {
                colors.setXYZ(i, 
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            } else {
                colors.setXYZ(i, 0.3, 0.3, 0.3);
            }
        }
        
        colors.needsUpdate = true;
    }
    
    deselectPoint() {
        this.selectedPointIndex = null;
        
        // 断开懒加载 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
            this._imageObserver = null;
        }
        
        // 恢复占位符
        const imagesContainer = document.getElementById('card-images');
        if (imagesContainer) {
            imagesContainer.innerHTML = '<span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>';
        }
        
        // 恢复所有点颜色
        if (this.points && this.points.userData.originalColors) {
            const colors = this.points.geometry.attributes.color;
            const originalColors = this.points.userData.originalColors;
            
            for (let i = 0; i < colors.count; i++) {
                colors.setXYZ(i, 
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            }
            colors.needsUpdate = true;
        }
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
    
    startLogPolling(outputFilename = null) {
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
                    setTimeout(() => {
                        if (outputFilename) {
                            this.loadDataByFilename(outputFilename);
                        } else {
                            this.loadExistingData();
                        }
                    }, 1500);
                }
            } catch (error) {
                console.error('日志轮询失败:', error);
            }
        }, 1000);
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
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 50);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(50, 50, 50);
        this.scene.add(pointLight);
        
        window.addEventListener('resize', () => this.onResize());
        
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        this.animate();
    }
    
    async loadExistingData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('没有现有数据');
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            document.getElementById('loading').style.display = 'none';
            this.addLog('✅ 已加载现有数据', 'success');
            
        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            this.addLog('📁 未找到现有数据，请选择数据集或上传文件', 'info');
        }
    }
    
    async loadDataByFilename(filename) {
        try {
            const response = await fetch(`/api/data?file=${encodeURIComponent(filename)}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
                this.points = null;
            }
            
            this.data = await response.json();
            
            if (!this.data || !this.data.points) {
                throw new Error('数据格式错误');
            }
            
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 数据加载完成：' + filename, 'success');
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    async loadData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 新数据加载完成', 'success');
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    createPointCloud() {
        const points = this.data.points;
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        
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
        
        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: false
        });
        
        this.points = new THREE.Points(geometry, material);
        this.points.userData = {
            pointsData: points,
            originalColors: colors.slice()
        };
        this.scene.add(this.points);
        
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
        // 已移除悬停 tooltip，改为点击交互
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
