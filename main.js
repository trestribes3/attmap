// var host = "http://localhost:8080/tribalwars_scripts/";
var host = "https://github.com/trestribes3/attmap/";

$.getScript("https://github.com/trestribes3/attmap/blob/main/vue.js");
$.get(host + "utils.js");
$("#content_value").parent().after("<tr><td id='loadhere'></td></tr>");
$("#loadhere").load(host + "map_attacker/form.html");

function waitForVueToStart() {
    if (typeof Vue === "undefined") setTimeout(waitForVueToStart, 10); else main();
}
waitForVueToStart();

var app;
function main() {
    app = new Vue({
        el: "#vueapp",
        data: {
            Darxeal: Darxeal,
            units: game_data.units,
            buildings: Object.keys(game_data.village.buildings),
            unitData: null,
            imageBase: image_base,
            timezoneDifference: new Date().getTimezoneOffset() * 60 * 1000,
            source: null,
            target: null,
            unitCounts: game_data.units.reduce((a,b) => (a[b]=0, a), {}),
            unitSendAlls: game_data.units.reduce((a,b) => (a[b]=false, a), {}),
            desiredTime: null,
            commandTimingType: "arrival",
            catapultTarget: "main",
            train: [],
            commandType: "attack",
            ctx: null,
            timeForTimers: Date.now(),
            commandList: [],
            templates: []
        },
        mounted: async function() {
            timepicker.valueAsNumber = this.desiredTime = Timing.getCurrentServerTime() - this.timezoneDifference;

            // overload map click event
            TWMap.mapHandler.onClick = this.mapVillageClicked;
            var original = TWMap.mapHandler.onMovePixel; // redraw canvas on map move
            TWMap.mapHandler.onMovePixel = (e, a) => {original(e, a); this.redrawCanvas();};
            var original2 = TWMap.mapHandler.onResize; // adjust canvas dimensions on map resize
            TWMap.mapHandler.onResize = (e, a) => {original2(e, a); canvas_el.width = e; canvas_el.height = a; this.redrawCanvas();};

            $("#map_config").hide();
            $("#map_legend").hide();
            $("#content_value>h2").hide();
            $("#content_value br").hide();
            $("#village_colors").prev().hide();
            $("#map_topo>form").hide();
            $("#map_topo>table").hide();

            let response = await Darxeal.unitsInfo();
            this.unitData = response.unit_data;
            delete this.unitData.militia;
            this.units = Object.keys(this.unitData);

            map_whole.children[0].children[0].children[0].outerHTML +=
                "<canvas id='canvas_el' style='position: absolute; margin-left: 17px; z-index: 99; pointer-events: none;'></canvas>";
            canvas_el.width = map.offsetWidth;
            canvas_el.height = map.offsetHeight;
            this.ctx = canvas_el.getContext("2d");

            setInterval(() => {
                this.timeForTimers = Date.now();
                for(var command of this.commandList) if (command.countdownSeconds > 0) {
                    command.countdownSeconds--;
                }
            }, 1000);

            Darxeal.interceptErrorMessage();

            this.templates = await $.get(host + "map_attacker/templates.json");
        },
        methods: {
            unitImage: function(unit) {
                return this.imageBase + "unit/unit_" + unit + ".png";
            },
            centerMap: function(x, y) {
                TWMap.map.centerPos(x, y);
            },
            mapVillageClicked: function(x, y)  {
                var clickedVillage = TWMap.villages[x + "" + y];
                if (!clickedVillage)
                    return false;
                var isVillageOwnedByMe = clickedVillage.owner == game_data.player.id;
                var village = {
                    name: clickedVillage.name,
                    id: clickedVillage.id,
                    x: x,
                    y: y,
                    ownerID: clickedVillage.owner,
                    ownerName: clickedVillage.owner == "0" ? "Barbaři" : TWMap.players[clickedVillage.owner].name
                }
                if (isVillageOwnedByMe) this.source = village; else this.target = village;
                this.redrawCanvas();
                return false;
            },
            drawLine: function(x1, y1, x2, y2) {
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
                this.ctx.closePath();
            },
            drawCircle: function(x, y, radius) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.closePath();
            },
            drawCommand: function(source, target) {
                var mx = TWMap.map.pos[0];
                var my = TWMap.map.pos[1];
            
                this.ctx.fillStyle = this.ctx.strokeStyle;
            
                var x1 = source.x * 53 - mx + 26;
                var y1 = source.y * 38 - my + 19;
                var x2 = target.x * 53 - mx + 26;
                var y2 = target.y * 38 - my + 19;
            
                this.drawLine(x1, y1, x2, y2);
                this.drawCircle(x1, y1, 8);
                this.drawCircle(x2, y2, 8);
            },
            redrawCanvas: function() {
                    this.ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);
                    this.ctx.lineWidth = 3;
                    this.ctx.lineCap = "round";

                    for (var command of this.commandList) if (command.countdownSeconds > 0 || command.success) {
                        this.ctx.strokeStyle = command.commandType == "support" ? 'rgba(26,209,255,1)' : 'rgba(255,50,0,1)';
                        this.drawCommand(command.source, command.target);
                    }

                    if (this.source && this.target) {
                        this.ctx.strokeStyle = 'rgba(255,255,255,1)';
                        this.drawCommand(this.source, this.target);
                    }
            },
            addTrainRow: function() {
                var units = this.units.reduce((a,b) => (a[b]=0, a), {});
                units.snob = 1;
                units.axe = 100;
                units.light = 50;
                this.train.push(units);
            },
            addCommand: function() {
                let command = $.extend(true, {}, this.command);
                let timeout = setTimeout(this.sendCommand, command.timeoutMillis - Timing.getReturnTimeFromServer(), command);
                command.timeout = timeout;
                this.commandList.push(command);
            },
            removeCommand: function(command) {
                let index = this.commandList.indexOf(command);
                if (index > -1) {
                    this.commandList.splice(index, 1);
                }
                clearTimeout(command.timeout);
            },
            sendCommand: async function(command) {
                let unitsHome = await Darxeal.unitsHome(command.source.id);

                for (var unit of this.units) {
                    let requiredForTrain = 0;
                    let home = unitsHome[unit];

                    for (var row of command.train) {
                        requiredForTrain += row[unit];
                    }
                    if (requiredForTrain > home) {
                        command.status = "Nedostatek jednotek pro vláček.";
                        return;
                    }

                    if (unit == command.slowestUnit && home == 0) {
                        command.status = "Nedostatek jednotek.";
                        return;
                    }

                    let available = home - requiredForTrain;
                    if (command.unitSendAlls[unit])
                        command.unitCounts[unit] = available;
                    else
                        command.unitCounts[unit] = Math.min(available, command.unitCounts[unit]);
                    command.unitSendAlls[unit] = false;
                }

                let response = await Darxeal.sendCommand(command.target.x, command.target.y, command.source.id,
                    command.unitCounts, command.commandType, command.catapultTarget, command.train);
                if (response && response.message) {
                    command.status = response.message;
                } else {
                    command.status = response;
                    command.success = true;
                }
            },
            setTemplate: function(template) {
                for(var unit of this.units) {
                    this.unitSendAlls[unit] = template.all.includes(unit);
                    this.unitCounts[unit] = template.count[unit] ? template.count[unit] : 0;
                }
                this.train = [];
                for(var row of template.train) {
                    this.train.push(this.units.reduce((a,b) => (a[b]=row[b] ? row[b] : 0, a), {}));
                }
            }
        },
        computed: {
            supportAndPaladin: function() {
                return this.commandType == "support" && (this.unitCounts["knight"] > 0 || this.unitSendAlls["knight"]);
            },
            ableToSendTrain: function() {
                return this.commandType == "attack" && this.unitCounts["snob"] > 0;
            },
            isCommandSendable: function() {
                if (!this.source || !this.target)
                    return false;

                for (var unit of this.units) {
                    if (this.unitCounts[unit] > 0 || this.unitSendAlls[unit])
                        return true;
                }
                return false;
            },
            slowestUnit: function() {
                var slowestUnit;
                for (var unit of this.units) if (this.unitCounts[unit] > 0 || this.unitSendAlls[unit]) {
                    if (!slowestUnit || this.unitData[unit].speed < this.unitData[slowestUnit].speed)
                        slowestUnit = unit;
                }
                if (this.supportAndPaladin)
                    slowestUnit = "knight";

                return slowestUnit;
            },
            command: function() {
                var dx = Math.abs(this.source.x - this.target.x);
                var dy = Math.abs(this.source.y - this.target.y);
                var distance = Math.sqrt(dx*dx + dy*dy);

                // find slowest unit
                var slowestUnit = this.slowestUnit;

                var durationSeconds = Math.round(distance / this.unitData[slowestUnit].speed);
                var durationMillis = durationSeconds * 1000;

                var _ = this.timeForTimers;
                var timeoutMillis = this.desiredTime - Timing.getCurrentServerTime() + this.timezoneDifference;
            
                // if desired attack time is set to arrival, we have to send the command earlier (by its duration)
                if (this.commandTimingType == "arrival")
                    timeoutMillis -= durationMillis;
            
                // we cant send commands in the past :-)
                timeoutMillis = Math.max(timeoutMillis, 0);
            
                var countdownSeconds = Math.floor(timeoutMillis / 1000);
            
                var departureDate = new Date(Timing.getCurrentServerTime() + timeoutMillis);
                var arrivalDate = new Date(departureDate.getTime() + durationMillis);

                var trainArrivalDates = [];
                for (let i = 1; i <= this.train.length; i++) {
                    trainArrivalDates.push(new Date(arrivalDate.getTime() + i*100));
                }

                return {
                    source: this.source,
                    target: this.target,
                    unitCounts: this.unitCounts,
                    unitSendAlls: this.unitSendAlls,
                    desiredTime: this.desiredTime,
                    commandTimingType: this.commandTimingType,
                    catapultTarget: this.catapultTarget,
                    train: this.ableToSendTrain ? this.train: [],
                    commandType: this.commandType,
                    slowestUnit: slowestUnit,
                    durationSeconds: durationSeconds,
                    durationMillis: durationSeconds * 1000,
                    timeoutMillis: timeoutMillis,
                    countdownSeconds: countdownSeconds,
                    departureDate: departureDate,
                    arrivalDate: arrivalDate,
                    trainArrivalDates: trainArrivalDates,
                    status: "",
                    success: false
                }
            }
        }
    });
}

// ColorGroups.Own.groups
// TWMap.villageKey
