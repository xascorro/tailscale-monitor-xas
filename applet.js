const Applet = imports.ui.applet;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;

function MyApplet(metadata, orientation, panel_height, instance_id) {
    this._init(metadata, orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {
        try {
            Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

            this.set_applet_icon_symbolic_name("network-vpn-symbolic");
            this.set_applet_tooltip("Tailscale Monitor");
            // this.set_applet_label("...");

            // Inicializar el menú desplegable
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager.addMenu(this.menu);

            this.is_online = false;
            this.raw_status = "";

            // Actualización automática cada 10 segundos
            this._update_loop();
        } catch (e) {
            global.logError(e);
        }
    },

    _update_loop: function() {
        this._check_status();
        this._update_id = Mainloop.timeout_add_seconds(10, () => this._update_loop());
    },

    _check_status: function() {
        try {
            let [res, out] = GLib.spawn_command_line_sync("tailscale status");
            let output = out.toString();

            if (output.includes("Tailscale is stopped") || output.trim() === "") {
                // this.set_applet_label(" OFF");
                this.set_applet_icon_symbolic_name("network-error-symbolic");
                this.is_online = false;
                this.raw_status = "";
            } else {
                // this.set_applet_label(" ON");
                this.set_applet_icon_symbolic_name("network-vpn-symbolic");
                this.is_online = true;
                this.raw_status = output;
            }
        } catch (e) {
            this.is_online = false;
            this.set_applet_label(" Error");
        }
    },

    on_applet_clicked: function() {
        try {
            this.menu.removeAll();

            // --- SECCIÓN 1: CONTROL (ON/OFF) ---
            let actionLabel = this.is_online ? "Desconectar Tailscale" : "Conectar Tailscale";
            let actionIcon = this.is_online ? "media-playback-stop-symbolic" : "media-playback-start-symbolic";
            
            let menuAction = new PopupMenu.PopupIconMenuItem(actionLabel, actionIcon, St.IconType.SYMBOLIC);
            
            menuAction.connect('activate', () => {
                // 1. Cerramos el menú inmediatamente
                this.menu.close();
                
                // 2. Definimos la acción
                let action = this.is_online ? "down" : "up";
                
                // 3. Lanzamos el comando forzando el diálogo de contraseña
                // Usamos un pequeño delay para que Cinnamon libere el foco
                Mainloop.timeout_add(100, () => {
                    Util.spawnCommandLine('sh -c "/usr/bin/pkexec /usr/bin/tailscale ' + action + '"');
                });

                // 4. Refresco visual
                Mainloop.timeout_add_seconds(4, () => this._check_status());
            });
            
            this.menu.addMenuItem(menuAction);

            // --- SECCIÓN 2: LISTA DE EQUIPOS (Verde para conectados) ---
            if (this.is_online && this.raw_status) {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                
                let lines = this.raw_status.split('\n');
                lines.forEach(line => {
                    let cleanLine = line.trim();
                    // Filtramos cabeceras, líneas vacías y los avisos de "Health check"
                    if (cleanLine === "" || cleanLine.startsWith("ID") || cleanLine.startsWith("#") || cleanLine.includes("Health check")) return;

                    let parts = cleanLine.split(/\s+/);
                    if (parts.length >= 2) {
                        let ip = parts[0];
                        let name = parts[1];
                        
                        // LÓGICA BASADA EN TU OUTPUT:
                        // 'marvin' es tu equipo actual (siempre es el primero en tu lista)
                        let isSelf = (name === "marvin");
                        
                        // En tu red, el '-' significa que el equipo está disponible.
                        // Solo consideraremos offline si la línea dijera algo como "offline"
                        let isOnline = !line.toLowerCase().includes("offline");
                        
                        let iconName = "radio-symbolic"; // Círculo vacío (Offline)
                        
                        if (isSelf) {
                            iconName = "emblem-favorite-symbolic"; // Estrella para Marvin
                        } else if (isOnline) {
                            // Este icono se verá VERDE en Linux Mint (Cinnamon)
                            iconName = "emblem-ok-symbolic"; 
                        }

                        let item = new PopupMenu.PopupIconMenuItem(
                            name + " (" + ip + ")", 
                            iconName, 
                            St.IconType.SYMBOLIC
                        );

                        // Si por algún motivo estuviera offline, bajamos opacidad
                        if (!isOnline) {
                            item.actor.opacity = 140;
                        }

                        item.connect('activate', () => {
                            Util.spawnCommandLine("sh -c 'echo " + ip + " | xclip -selection clipboard'");
                            Util.spawnCommandLine("notify-send \"Tailscale\" \"IP " + ip + " copiada\"");
                        });
                        
                        this.menu.addMenuItem(item);
                    }
                });
            }

            this.menu.toggle();
        } catch (e) {
            global.logError(e);
        }
    },

    on_applet_removed_from_panel: function() {
        if (this._update_id) {
            Mainloop.source_remove(this._update_id);
        }
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(metadata, orientation, panel_height, instance_id);
}