/**
 * Reproductor de Video con soporte Chromecast
 * @author TuNombre
 * @version 1.0.0
 */

// ============================================
// Configuración global
// ============================================
const CONFIG = {
    // Carpeta donde se encuentran los videos
    VIDEOS_FOLDER: 'fuentes',
    
    // Extensiones de video soportadas
    SUPPORTED_FORMATS: ['.mp4', '.webm', '.ogg', '.mov'],
    
    // ID de la aplicación de Chromecast personalizada (opcional)
    // Si quieres usar el reproductor por defecto, déjalo como null
    CAST_APP_ID: null, // 'TU_APP_ID_PERSONALIZADO'
    
    // Configuración de Chromecast
    CAST_NAMESPACE: 'urn:x-cast:com.example.videoplayer',
    
    // Tiempo de actualización de progreso (ms)
    PROGRESS_UPDATE_INTERVAL: 1000,
};

// ============================================
// Clase principal del VideoPlayer
// ============================================
class VideoPlayer {
    constructor() {
        // Elementos DOM
        this.videoPlayer = document.getElementById('videoPlayer');
        this.playlistElement = document.getElementById('playlist');
        this.castButton = document.getElementById('castbutton');
        this.castOverlay = document.getElementById('castOverlay');
        this.loadingState = document.getElementById('loadingState');
        this.emptyState = document.getElementById('emptyState');
        this.videoTitle = document.getElementById('videoTitle');
        this.videoDuration = document.getElementById('videoDuration');
        this.progressFill = document.getElementById('progressFill');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        this.progressBar = document.getElementById('progressBar');
        
        // Botones de control
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.loopBtn = document.getElementById('loopBtn');
        
        // Estado de la aplicación
        this.state = {
            videos: [],
            currentIndex: 0,
            isShuffle: false,
            isLoop: false,
            isCasting: false,
            castSession: null,
            updateInterval: null,
        };
        
        // Inicializar
        this.init();
    }
    
    /**
     * Inicializa la aplicación
     */
    async init() {
        // Inicializar Chromecast
        this.initChromecast();
        
        // Cargar lista de videos
        await this.loadVideosList();
        
        // Configurar event listeners
        this.setupEventListeners();
    }
    
    /**
     * Inicializa la API de Chromecast
     */
    initChromecast() {
        // Verificar si la API de Chromecast está disponible
        window['__onGCastApiAvailable'] = (isAvailable) => {
            if (isAvailable) {
                this.initializeCastApi();
            } else {
                console.warn('API de Chromecast no disponible');
                this.hideCastButton();
            }
        };
    }
    
    /**
     * Inicializa la sesión de Chromecast
     */
    initializeCastApi() {
        const sessionRequest = new chrome.cast.SessionRequest(
            CONFIG.CAST_APP_ID || chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
        );
        
        const apiConfig = new chrome.cast.ApiConfig(
            sessionRequest,
            this.sessionListener.bind(this),
            this.receiverListener.bind(this)
        );
        
        chrome.cast.initialize(
            apiConfig,
            this.onCastInitSuccess.bind(this),
            this.onCastError.bind(this)
        );
    }
    
    /**
     * Callback cuando la API de Cast se inicializa correctamente
     */
    onCastInitSuccess() {
        console.log('API de Chromecast inicializada correctamente');
        
        // Si ya hay una sesión activa, reconectarse
        if (chrome.cast.session) {
            this.sessionListener(chrome.cast.session);
        }
    }
    
    /**
     * Callback cuando hay un error en la inicialización
     */
    onCastError(error) {
        console.error('Error al inicializar Chromecast:', error);
        this.hideCastButton();
    }
    
    /**
     * Listener para sesiones de cast
     */
    sessionListener(session) {
        this.state.castSession = session;
        this.state.isCasting = true;
        
        console.log('Nueva sesión de cast establecida:', session.sessionId);
        
        // Actualizar UI
        this.updateCastUI(true);
        
        // Si hay un video reproduciéndose, cargarlo en la sesión
        if (session.media.length === 0) {
            this.castCurrentVideo();
        }
        
        // Listener para cambios en la sesión
        session.addUpdateListener(this.sessionUpdateListener.bind(this));
    }
    
    /**
     * Listener para actualizaciones de la sesión
     */
    sessionUpdateListener(isAlive) {
        if (!isAlive) {
            this.state.isCasting = false;
            this.state.castSession = null;
            this.updateCastUI(false);
            console.log('Sesión de cast terminada');
        }
    }
    
    /**
     * Listener para disponibilidad de receptores
     */
    receiverListener(availability) {
        if (availability === chrome.cast.ReceiverAvailability.AVAILABLE) {
            console.log('Dispositivos Chromecast disponibles');
        }
    }
    
    /**
     * Transmite el video actual al Chromecast
     */
    castCurrentVideo() {
        if (!this.state.castSession || !this.state.videos[this.state.currentIndex]) {
            return;
        }
        
        const video = this.state.videos[this.state.currentIndex];
        const mediaInfo = new chrome.cast.media.MediaInfo(
            this.getFullVideoUrl(video.url),
            video.mimeType || 'video/mp4'
        );
        
        // Configurar metadatos
        mediaInfo.metadata = new chrome.cast.media.MovieMediaMetadata();
        mediaInfo.metadata.title = video.name;
        mediaInfo.metadata.subtitle = this.formatTime(video.duration || 0);
        
        // Configurar solicitud de carga
        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        request.currentTime = this.videoPlayer.currentTime;
        
        // Cargar en el receptor
        this.state.castSession.loadMedia(
            request,
            this.onMediaLoaded.bind(this),
            this.onMediaError.bind(this)
        );
    }
    
    /**
     * Callback cuando el medio se carga en Chromecast
     */
    onMediaLoaded(media) {
        console.log('Medio cargado en Chromecast correctamente');
        
        // Sincronizar controles
        this.videoPlayer.pause();
        this.updateCastUI(true);
        
        // Iniciar actualización de progreso
        this.startCastProgressUpdate(media);
    }
    
    /**
     * Actualiza el progreso durante la reproducción en Chromecast
     */
    startCastProgressUpdate(media) {
        // Limpiar intervalo anterior
        if (this.state.updateInterval) {
            clearInterval(this.state.updateInterval);
        }
        
        this.state.updateInterval = setInterval(() => {
            media.getEstimatedTime((currentTime) => {
                this.updateProgressBar(currentTime * 1000);
            });
        }, CONFIG.PROGRESS_UPDATE_INTERVAL);
    }
    
    /**
     * Callback cuando hay error al cargar medio en Chromecast
     */
    onMediaError(error) {
        console.error('Error al cargar medio en Chromecast:', error);
        this.state.isCasting = false;
        this.updateCastUI(false);
    }
    
    /**
     * Actualiza la UI cuando cambia el estado de cast
     */
    updateCastUI(isCasting) {
        if (isCasting) {
            this.castOverlay.classList.remove('hidden');
        } else {
            this.castOverlay.classList.add('hidden');
            if (this.state.updateInterval) {
                clearInterval(this.state.updateInterval);
                this.state.updateInterval = null;
            }
        }
    }
    
    /**
     * Oculta el botón de Chromecast si no está disponible
     */
    hideCastButton() {
        if (this.castButton) {
            this.castButton.style.display = 'none';
        }
    }
    
    /**
     * Carga la lista de videos desde la carpeta 'fuentes'
     * Como GitHub Pages no permite listar directorios, usamos un archivo de configuración
     */
    async loadVideosList() {
        try {
            // Método 1: Intentar cargar un archivo de lista (videos.json)
            const response = await fetch(`${CONFIG.VIDEOS_FOLDER}/videos.json`);
            
            if (response.ok) {
                const data = await response.json();
                this.state.videos = data.videos.map(video => ({
                    name: video.name || this.getFileNameFromPath(video.url),
                    url: video.url,
                    duration: video.duration || 0,
                    mimeType: video.mimeType || this.getMimeType(video.url),
                }));
            } else {
                throw new Error('No se pudo cargar videos.json');
            }
            
        } catch (error) {
            console.log('Usando lista de videos por defecto');
            
            // Método 2: Usar una lista predefinida (para desarrollo/pruebas)
            this.state.videos = this.getDefaultVideosList();
            
            // Método 3 (alternativo): Cargar desde un archivo de texto con URLs
            await this.tryLoadFromTextFile();
        }
        
        // Actualizar UI
        this.renderPlaylist();
        
        if (this.state.videos.length > 0) {
            this.loadingState.classList.add('hidden');
            this.emptyState.classList.add('hidden');
            this.loadVideo(0);
        } else {
            this.loadingState.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
        }
    }
    
    /**
     * Intenta cargar videos desde un archivo de texto
     */
    async tryLoadFromTextFile() {
        try {
            const response = await fetch(`${CONFIG.VIDEOS_FOLDER}/videos.txt`);
            if (response.ok) {
                const text = await response.text();
                const urls = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                
                if (urls.length > 0) {
                    this.state.videos = urls.map(url => ({
                        name: this.getFileNameFromPath(url),
                        url: url,
                        duration: 0,
                        mimeType: this.getMimeType(url),
                    }));
                }
            }
        } catch (error) {
            console.log('No se encontró archivo de texto con videos');
        }
    }
    
    /**
     * Obtiene lista de videos por defecto (para desarrollo)
     * Reemplaza estas URLs con las de tus videos reales
     */
    getDefaultVideosList() {
        return [
            {
                name: 'Big Buck Bunny',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                duration: 596, // segundos
                mimeType: 'video/mp4',
            },
            {
                name: 'Elephant Dream',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                duration: 653,
                mimeType: 'video/mp4',
            },
            {
                name: 'Sintel',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
                duration: 888,
                mimeType: 'video/mp4',
            },
            {
                name: 'Tears of Steel',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                duration: 734,
                mimeType: 'video/mp4',
            },
        ];
    }
    
    /**
     * Obtiene la URL completa de un video
     */
    getFullVideoUrl(url) {
        // Si ya es una URL absoluta, devolverla tal cual
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        // Si es una URL relativa, construir la URL completa
        const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
        return `${base}/${url}`;
    }
    
    /**
     * Obtiene el nombre del archivo desde una ruta
     */
    getFileNameFromPath(path) {
        const fileName = path.split('/').pop().split('?')[0];
        // Eliminar extensión y reemplazar guiones/guiones bajos por espacios
        return decodeURIComponent(fileName)
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
    
    /**
     * Obtiene el tipo MIME según la extensión del archivo
     */
    getMimeType(url) {
        const extension = url.split('.').pop().toLowerCase().split('?')[0];
        const mimeTypes = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'ogg': 'video/ogg',
            'ogv': 'video/ogg',
            'mov': 'video/quicktime',
        };
        return mimeTypes[extension] || 'video/mp4';
    }
    
    /**
     * Renderiza la lista de reproducción
     */
    renderPlaylist() {
        this.playlistElement.innerHTML = '';
        
        this.state.videos.forEach((video, index) => {
            const li = document.createElement('li');
            li.className = 'video-item';
            li.dataset.index = index;
            
            li.innerHTML = `
                <div class="video-item-thumbnail">
                    <video 
                        src="${this.getFullVideoUrl(video.url)}" 
                        preload="metadata"
                        muted
                    ></video>
                </div>
                <div class="video-item-info">
                    <div class="video-item-title">${video.name}</div>
                    <div class="video-item-duration">${this.formatTime(video.duration)}</div>
                </div>
                <div class="video-item-status">
                    ${index === this.state.currentIndex ? '▶️' : ''}
                </div>
            `;
            
            li.addEventListener('click', () => this.loadVideo(index));
            this.playlistElement.appendChild(li);
        });
    }
    
    /**
     * Carga un video específico en el reproductor
     */
    loadVideo(index) {
        if (index < 0 || index >= this.state.videos.length) return;
        
        this.state.currentIndex = index;
        const video = this.state.videos[index];
        
        // Actualizar reproductor
        this.videoPlayer.src = this.getFullVideoUrl(video.url);
        this.videoPlayer.load();
        
        // Actualizar información
        this.videoTitle.textContent = video.name;
        this.videoDuration.textContent = this.formatTime(video.duration);
        this.totalTimeDisplay.textContent = this.formatTime(video.duration);
        
        // Actualizar playlist visual
        document.querySelectorAll('.video-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
            const status = item.querySelector('.video-item-status');
            status.textContent = i === index ? '▶️' : '';
        });
        
        // Si está transmitiendo, actualizar Chromecast
        if (this.state.isCasting) {
            this.castCurrentVideo();
        }
        
        // Intentar reproducir automáticamente
        this.videoPlayer.play().catch(() => {
            console.log('Reproducción automática bloqueada por el navegador');
        });
    }
    
    /**
     * Reproduce el siguiente video
     */
    playNext() {
        if (this.state.videos.length === 0) return;
        
        if (this.state.isShuffle) {
            const randomIndex = Math.floor(Math.random() * this.state.videos.length);
            this.loadVideo(randomIndex);
        } else {
            const nextIndex = (this.state.currentIndex + 1) % this.state.videos.length;
            
            if (nextIndex === 0 && !this.state.isLoop) {
                this.videoPlayer.pause();
                return;
            }
            
            this.loadVideo(nextIndex);
        }
    }
    
    /**
     * Reproduce el video anterior
     */
    playPrevious() {
        if (this.state.videos.length === 0) return;
        
        const prevIndex = this.state.currentIndex === 0 
            ? this.state.videos.length - 1 
            : this.state.currentIndex - 1;
        
        this.loadVideo(prevIndex);
    }
    
    /**
     * Configura todos los event listeners
     */
    setupEventListeners() {
        // Evento cuando el video termina
        this.videoPlayer.addEventListener('ended', () => {
            this.playNext();
        });
        
        // Evento de metadatos cargados (duración disponible)
        this.videoPlayer.addEventListener('loadedmetadata', () => {
            const duration = this.videoPlayer.duration;
            if (duration && !isNaN(duration)) {
                this.state.videos[this.state.currentIndex].duration = duration;
                this.videoDuration.textContent = this.formatTime(duration);
                this.totalTimeDisplay.textContent = this.formatTime(duration);
                this.updatePlaylistItemDuration(this.state.currentIndex, duration);
            }
        });
        
        // Actualizar barra de progreso
        this.videoPlayer.addEventListener('timeupdate', () => {
            if (!this.state.isCasting) {
                this.updateProgressBar(this.videoPlayer.currentTime * 1000);
                this.currentTimeDisplay.textContent = this.formatTime(this.videoPlayer.currentTime);
            }
        });
        
        // Barra de progreso clickeable
        this.progressBar.addEventListener('click', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            const newTime = percentage * this.videoPlayer.duration;
            this.videoPlayer.currentTime = newTime;
        });
        
        // Botón de reproducción aleatoria
        this.shuffleBtn.addEventListener('click', () => {
            this.state.isShuffle = !this.state.isShuffle;
            this.shuffleBtn.classList.toggle('active', this.state.isShuffle);
        });
        
        // Botón de repetición
        this.loopBtn.addEventListener('click', () => {
            this.state.isLoop = !this.state.isLoop;
            this.loopBtn.classList.toggle('active', this.state.isLoop);
        });
        
        // Atajos de teclado
        document.addEventListener('keydown', (e) => {
            // Ignorar si se está escribiendo en un input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (this.videoPlayer.paused) {
                        this.videoPlayer.play();
                    } else {
                        this.videoPlayer.pause();
                    }
                    break;
                case 'arrowright':
                    e.preventDefault();
                    this.videoPlayer.currentTime += 10;
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    this.videoPlayer.currentTime -= 10;
                    break;
                case 'n':
                    this.playNext();
                    break;
                case 'p':
                    this.playPrevious();
                    break;
            }
        });
        
        // Evento para pantalla completa
        this.videoPlayer.addEventListener('dblclick', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                this.videoPlayer.requestFullscreen();
            }
        });
    }
    
    /**
     * Actualiza la barra de progreso
     */
    updateProgressBar(currentTimeMs) {
        const video = this.state.videos[this.state.currentIndex];
        if (!video || !video.duration) return;
        
        const percentage = (currentTimeMs / (video.duration * 1000)) * 100;
        this.progressFill.style.width = `${Math.min(percentage, 100)}%`;
        
        if (!this.state.isCasting) {
            this.currentTimeDisplay.textContent = this.formatTime(currentTimeMs / 1000);
        }
    }
    
    /**
     * Actualiza la duración en el item de la playlist
     */
    updatePlaylistItemDuration(index, duration) {
        const items = document.querySelectorAll('.video-item');
        if (items[index]) {
            const durationElement = items[index].querySelector('.video-item-duration');
            if (durationElement) {
                durationElement.textContent = this.formatTime(duration);
            }
        }
    }
    
    /**
     * Formatea tiempo en segundos a formato HH:MM:SS o MM:SS
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '--:--';
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

// ============================================
// Iniciar la aplicación cuando el DOM esté listo
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayerApp = new VideoPlayer();
});
