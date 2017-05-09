function GameManager(size, InputManager, Actuator, StorageManager) {
    //  localStorage.setItem("id", document.getElementById("starttiles").value)
    //  var start = document.getElementById("starttiles").value;
    this.size = size;
    // Size of the grid
    this.inputManager = new InputManager;
    this.storageManager = new StorageManager;
    this.actuator = new Actuator;

    this.startTiles = localStorage.getItem("startingtilesinput");
    //number of tiles to start with

    this.inputManager.on("move", this.move.bind(this));
    this.inputManager.on("restart", this.restart.bind(this));
    this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

    this.setup();
}

// Restart the game
GameManager.prototype.restart = function() {
    if (top.location.href !== window.location.href) {
        //  alert('iframe');
        //  parent.cmgGameEvent("replay");
        this.storageManager.clearGameState();
        this.actuator.continueGame();
        // Clear the game won/lost message
        this.setup();
        parent.cmgGameEvent("replay");
    } else {
        //  alert('not iframe');
        this.storageManager.clearGameState();
        this.actuator.continueGame();
        // Clear the game won/lost message
        this.setup();
    }
}
;

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function() {
    this.keepPlaying = true;
    this.actuator.continueGame();
    // Clear the game won/lost message
}
;

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function() {
    return this.over || (this.won && !this.keepPlaying);
}
;

// Set up the game
GameManager.prototype.setup = function() {
    var previousState = this.storageManager.getGameState();

    // Reload the game from a previous game if present
    if (previousState) {
        this.grid = new Grid(previousState.grid.size,previousState.grid.cells);
        // Reload grid
        this.score = previousState.localStorage.getItem("startscoreinput");
        this.over = previousState.over;
        this.won = previousState.won;
        this.keepPlaying = previousState.keepPlaying;
    } else {
        this.grid = new Grid(this.size);
        this.score = localStorage.getItem("startscoreinput");
        //Change this value to change starting score
        this.over = false;
        this.won = false;
        this.keepPlaying = false;

        // Add the initial tiles
        this.addStartTiles();
    }

    // Update the actuator
    this.actuate();
}
;

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function() {
    for (var i = 0; i < this.startTiles; i++) {
        this.addRandomTile();
    }
}
;

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function() {
    if (this.grid.cellsAvailable()) {
        var value = Math.random() < 0.9 ? localStorage.getItem("startv1") : localStorage.getItem("startv2");
        //numbers on tiles when spawning
        var tile = new Tile(this.grid.randomAvailableCell(),value);

        this.grid.insertTile(tile);
    }
}
;

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function() {
    var hackedscore = localStorage.getItem("startscoreinput").value
    if (this.storageManager.getBestScore() < this.hackedscore) {
        this.storageManager.setBestScore(this.score);
    }

    // Clear the state when the game is over (game over only, not win)
    if (this.over) {
        this.storageManager.clearGameState();
    } else {
        this.storageManager.setGameState(this.serialize());
    }

    this.actuator.actuate(this.grid, {
        score: this.score,
        over: this.over,
        won: this.won,
        bestScore: this.storageManager.getBestScore(),
        terminated: this.isGameTerminated()
    });

}
;

// Represent the current game as an object
GameManager.prototype.serialize = function() {
    return {
        grid: this.grid.serialize(),
        score: this.score,
        over: this.over,
        won: this.won,
        keepPlaying: this.keepPlaying
    };
}
;

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function() {
    this.grid.eachCell(function(x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.savePosition();
        }
    });
}
;

// Move a tile and its representation
GameManager.prototype.moveTile = function(tile, cell) {
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
}
;

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function(direction) {
    // 0: up, 1: right, 2: down, 3: left
    var self = this;

    if (this.isGameTerminated())
        return;
    // Don't do anything if the game's over

    var cell, tile;

    var vector = this.getVector(direction);
    var traversals = this.buildTraversals(vector);
    var moved = false;

    // Save the current tile positions and remove merger information
    this.prepareTiles();

    // Traverse the grid in the right direction and move tiles
    traversals.x.forEach(function(x) {
        traversals.y.forEach(function(y) {
            cell = {
                x: x,
                y: y
            };
            tile = self.grid.cellContent(cell);

            if (tile) {
                var positions = self.findFarthestPosition(cell, vector);
                var next = self.grid.cellContent(positions.next);

                // Only one merger per row traversal?
                if (next && next.value === tile.value && !next.mergedFrom) {
                    var merged = new Tile(positions.next,tile.value * localStorage.getItem("tilemult"));
                    //number tiles are multiplied
                    merged.mergedFrom = [tile, next];

                    self.grid.insertTile(merged);
                    self.grid.removeTile(tile);

                    // Converge the two tiles' positions
                    tile.updatePosition(positions.next);

                    // Update the score
                    self.score += merged.value;

                    // The mighty 2048 tile
                    if (merged.value === (localStorage.getItem("winscore")))
                        self.won = true;
                    //score to win
                } else {
                    self.moveTile(tile, positions.farthest);
                }

                if (!self.positionsEqual(cell, tile)) {
                    moved = true;
                    // The tile moved from its original cell!
                }
            }
        });
    });

    if (moved) {
        this.addRandomTile();

        if (!this.movesAvailable()) {
            this.over = true;
            // Game over!
        }

        this.actuate();
    }
}
;

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function(direction) {
    // Vectors representing tile movement
    var map = {
        0: {
            x: 0,
            y: -1
        },
        // Up
        1: {
            x: 1,
            y: 0
        },
        // Right
        2: {
            x: 0,
            y: 1
        },
        // Down
        3: {
            x: -1,
            y: 0
        }// Left
    };

    return map[direction];
}
;

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function(vector) {
    var traversals = {
        x: [],
        y: []
    };

    for (var pos = 0; pos < this.size; pos++) {
        traversals.x.push(pos);
        traversals.y.push(pos);
    }

    // Always traverse from the farthest cell in the chosen direction
    if (vector.x === 1)
        traversals.x = traversals.x.reverse();
    if (vector.y === 1)
        traversals.y = traversals.y.reverse();

    return traversals;
}
;

GameManager.prototype.findFarthestPosition = function(cell, vector) {
    var previous;

    // Progress towards the vector direction until an obstacle is found
    do {
        previous = cell;
        cell = {
            x: previous.x + vector.x,
            y: previous.y + vector.y
        };
    } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));
    return {
        farthest: previous,
        next: cell // Used to check if a merge is required
    };
}
;

GameManager.prototype.movesAvailable = function() {
    return this.grid.cellsAvailable() || this.tileMatchesAvailable();
}
;

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function() {
    var self = this;

    var tile;

    for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) {
            tile = this.grid.cellContent({
                x: x,
                y: y
            });

            if (tile) {
                for (var direction = 0; direction < 4; direction++) {
                    var vector = self.getVector(direction);
                    var cell = {
                        x: x + vector.x,
                        y: y + vector.y
                    };

                    var other = self.grid.cellContent(cell);

                    if (other && other.value === tile.value) {
                        return true;
                        // These two tiles can be merged
                    }
                }
            }
        }
    }

    return false;
}
;

GameManager.prototype.positionsEqual = function(first, second) {
    return first.x === second.x && first.y === second.y;
}
;
function savestarttiles() {
    if (document.getElementById("starttiles").value >= 2) {
        localStorage.setItem("startingtilesinput", document.getElementById("starttiles").value);
    } else {
        alert("Starting tiles must be more than 2!")
    }
}
function savestartscore() {
    localStorage.setItem("startscoreinput", document.getElementById("startscore").value);
}
function savetileone() {
    localStorage.setItem("startv1", document.getElementById("starttilevone").value);
}
function savetiletwo() {
    localStorage.setItem("startv2", document.getElementById("starttilevtwo").value);
}
function winscore() {
    localStorage.setItem("winscore", document.getElementById("winscore").value);
}
function tilemult() {
    localStorage.setItem("tilemult", document.getElementById("tilemult").value);
}
function saveall() {
    if ((document.getElementById("starttiles").value >= 2) && (document.getElementById("starttilevone").value >= 1) && (document.getElementById("starttilevtwo").value >= 1) && (document.getElementById("winscore").value >= 1) && (document.getElementById("tilemult").value >= 1) && (document.getElementById("startscore").value >= 0)) {
        localStorage.setItem("startscoreinput", document.getElementById("startscore").value);
        localStorage.setItem("startv1", document.getElementById("starttilevone").value);
        localStorage.setItem("startv2", document.getElementById("starttilevtwo").value);
        localStorage.setItem("winscore", document.getElementById("winscore").value);
        localStorage.setItem("tilemult", document.getElementById("tilemult").value);
        localStorage.setItem("startingtilesinput", document.getElementById("starttiles").value);
    }
    else{
        alert("Not all values were entered in!")
    }
}
window.onload = function(){
    document.getElementById("starttilevone").value = localStorage.getItem("startv1");
    document.getElementById("startscore").value = localStorage.getItem("startscoreinput");
    document.getElementById("starttilevtwo").value = localStorage.getItem("startv2");
    document.getElementById("winscore").value = localStorage.getItem("winscore");
    document.getElementById("tilemult").value = localStorage.getItem("tilemult");
    document.getElementById("starttiles").value = localStorage.getItem("startingtilesinput");
}
    document.getElementById("applyvalues")
    .addEventListener("keyup", function(event) {
    event.preventDefault();
    if (event.keyCode == 13) {
        document.getElementById("restart").click();
    }
});
