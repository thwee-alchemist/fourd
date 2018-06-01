
var CONSTANTS = {
  scene: {
    width: 1000,
    height: 500,
    far: 100000,
    zoom: -50,
    antialias: true,
    background: 0xffffff,
    camera_distance: -50,
  },
  vertex: {
    size: 10,
    color: 0x000000,
    wireframe: false,
    texture: undefined
  },
  edge: {
    strength: 1.0
  },
  bhn3: {
    inner_distance: 0.36
  },
  layout: {
    epsilon: 0.1,
    attraction: 0.1,
    friction: 0.60,
    repulsion: 50.0
  }
};


class Cube extends THREE.Mesh {
  constructor(options){    
    var settings = Object.assign(CONSTANTS.vertex, options);

    var geometry = new THREE.BoxGeometry(
      settings.size,
      settings.size,
      settings.size
    );
    geometry.dynamic = true;
    
    var material_args;
    if(settings.texture !== undefined){
      material_args = {
        map: new THREE.TextureLoader().load(settings.texture)
      };
    }else{
      material_args = {
        color: settings.color,
        wireframe: settings.wireframe
      }
    }
    
    var material = new THREE.MeshBasicMaterial(material_args);
    
    super(geometry, material);
    this.position.set(
      Math.random()*2,
      Math.random()*2,
      Math.random()*2
    )
    this.matrixAutoUpdate = true;
    this.settings = settings;
    
    return this;
  }
}

class Vertex extends THREE.Group{
  constructor(options){
    super();
    this.matrixAutoUpdate = true;

    this.position.set(
      Math.random(),
      Math.random(),
      Math.random()
    );
    
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    
    this.settings = Object.assign(CONSTANTS.vertex, options);
    
    if(this.settings.cube){
      var cube = new Cube(this.settings.cube);
      this.add(cube);
      cube.vertex = this;
    }
    
    if(this.settings.label){
      var label = new Label(this.settings.label);
      this.add(label);
      label.vertex = this;
    }
    
    this.edges = new Set();
    return this;
  }
  
  paint(scene){
    scene.add(this);
  }
}


class Edge extends THREE.Line {
  constructor(source, target, options){
    var settings = Object.assign({
      color: 0x000000,
      transparent: false,
      opacity: 1.0,
    }, options);
    
    var geometry = new THREE.Geometry();
    geometry.dynamic = true;
    geometry.vertices.push(source.position);
    geometry.vertices.push(target.position);
    geometry.verticesNeedUpdate = true;
    
    var material = new THREE.LineBasicMaterial(settings);
    
    super(geometry, material);
    
    this.settings = Object.assign({
      attraction: CONSTANTS.layout.attraction
    }, settings);
    
    this.source = source;
    source.edges.add(this);
    this.target = target;
    target.edges.add(this);
    this.frustumCulled = false;

    return this;
  }
  
  prepare_destruction(){
    this.source.edges.delete(this);
    this.target.edges.delete(this);
  }
  
  paint(scene){
    scene.add(this);
  }
}


class BarnesHutNode3{
  constructor(options){
    this.inners = new Set();
    this.outers = new Map();
    this.center_sum = new THREE.Vector3();
    
    this.settings = Object.assign({
      inner_distance: CONSTANTS.bhn3.inner_distance,
      repulsion: CONSTANTS.layout.repulsion
    }, options);
  }
  
  center(){
    return this.center_sum.clone().divideScalar(this.inners.size);
  }
  
  place_inner(vertex){
    this.inners.add(vertex);
    this.center_sum.add(vertex.position);
  }
  
  get_octant(position){
    var center = this.center();
    var x = center.x < position.x ? 'l' : 'r';
    var y = center.y < position.y ? 'u' : 'd';
    var z = center.z < position.z ? 'i' : 'o';
    return x + y + z;
  }
  
  place_outer(vertex){
    var octant = this.get_octant(vertex.position);
    if(!this.outers.has(octant)){
      this.outers.set(octant, new BarnesHutNode3);
    }
    this.outers.get(octant).insert(vertex);
  }
  
  insert(vertex){
    if(!this.inners.size){
      this.place_inner(vertex);
    }else{
      if(this.center().distanceTo(vertex.position) <= this.settings.inner_distance){
        this.place_inner(vertex);
      }else{
        this.place_outer(vertex);
      }
    }
  }
  
  estimate(vertex, force, force_fn){
    if(this.inners.has(vertex)){
      this.inners.forEach(v => {
        if(vertex !== v){
          force.add(force_fn(vertex.position, v.position));
        }
      });
    }else{
      var sumstimate = force_fn(vertex.position, this.center());
      sumstimate.multiplyScalar(this.inners.size);
      force.add(sumstimate);
    }
    
    this.outers.forEach(node => node.estimate(vertex, force, force_fn));
  }
  
  static pairwise_repulsion(options, x1, x2){
    x1 = x1.clone();
    x2 = x2.clone();
    
    var difference = x1.sub(x2);
    
    // first term
    var enumerator1 = options.repulsion;
    var abs_difference = difference.length();
    
    var sum = options.epsilon + abs_difference;
    var denominator1 = sum*sum;
    
    var term1 = enumerator1/denominator1;
    
    // second term
    var enumerator2 = difference;
    var denominator2 = abs_difference;
    
    var term2 = enumerator2.divideScalar(denominator2);
    
    var result = term2.multiplyScalar(term1);
    return result;
  }
}


class Graph extends THREE.Scene{
  constructor(options){
    super();
    this.V = new Set();
    this.E = new Set();
    this.settings = Object.assign(CONSTANTS.layout, options);
    
    this.pairwise_repulsion = BarnesHutNode3.pairwise_repulsion.bind(null, {
      repulsion: this.settings.repulsion,
      epsilon: this.settings.epsilon
    });
    
    return this;
  }
  
  clear(){
    this.V = new Set();
    this.E = new Set();
  }
  
  add_vertex(options){
    var vertex = new Vertex(options);
    vertex.paint(this);
    this.V.add(vertex);
    return vertex;
  }
    
  add_edge(source, target, options){
    var edge = new Edge(source, target, options);
    edge.paint(this);
    this.E.add(edge);
    return edge;
  }
  
  remove_edge(edge){
    edge.prepare_destruction();
    this.remove(edge);
    this.E.delete(edge);
  }
  
  remove_vertex(vertex){
    vertex.edges.forEach(edge => {
      this.remove_edge(edge);
    });
    
    this.remove(vertex);
    this.V.delete(vertex);
  }
  
  layout(){
    var tree = new BarnesHutNode3();
    
    this.V.forEach(vertex => {
      vertex.acceleration = new THREE.Vector3();
      vertex.repulsion_forces = new THREE.Vector3();
      vertex.attraction_forces = new THREE.Vector3();
      
      tree.insert(vertex);
    });
    
    this.V.forEach(vertex => {
      vertex.repulsion_forces = vertex.repulsion_forces || new THREE.Vector3();
      vertex.repulsion_forces.set(0, 0, 0);
      tree.estimate(
        vertex, 
        vertex.repulsion_forces, 
        this.pairwise_repulsion
      );
    });
    
    // calculate attractions
    this.E.forEach(edge => {
      var f = edge.source.position.clone().sub(edge.target.position);
      f.multiplyScalar(-1 * this.settings.attraction); // * edge.strength
      edge.source.attraction_forces.sub(f);
      edge.target.attraction_forces.add(f);
      
      // this is probably the place for gravity
    });
    
    this.V.forEach(vertex => {
      var friction = vertex.velocity.multiplyScalar(this.settings.friction);
      
      vertex.acceleration.add(
        vertex.repulsion_forces.clone().add(
          vertex.attraction_forces.clone().negate()
        )
      );
      vertex.acceleration.sub(friction);
      vertex.velocity.add(vertex.acceleration);
      vertex.position.add(vertex.velocity);
    });
    
    this.E.forEach(edge => {
      edge.geometry.dirty = true;
      edge.geometry.__dirty = true;
      edge.geometry.verticesNeedUpdate = true;
    });
  }
}


class FourD{
  constructor(options){
    this.settings = Object.assign({
      width: CONSTANTS.scene.width,
      height: CONSTANTS.scene.height,
      canvas: undefined,
      far: CONSTANTS.scene.far,
      antialias: CONSTANTS.scene.antialias,
      background: CONSTANTS.scene.background,
      camera_distance: CONSTANTS.scene.camera_distance,
    }, options);
    
    this.graph = new Graph(); // Graph inherits from Scene
    this.scene = this.graph;
    
    this.camera = new THREE.PerspectiveCamera(
      75, 
      this.settings.width / this.settings.height,
      1,
      this.settings.far
    );
    
    this.light = new THREE.PointLight(0xf0f0f0);
    this.scene.add(this.camera);
    this.scene.add(this.light);
    
    if(this.settings.canvas){
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.settings.antialias,
        canvas: this.settings.canvas
      });
    }else{
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.settings.antialias
      });
    }
    this.renderer.setClearColor(this.settings.background);
    this.renderer.setSize(this.settings.width, this.settings.height);
    
    this.camera.position.z = this.settings.camera_distance;
    this.camera.lookAt(new THREE.Vector3());
    
    this.clock = new THREE.Clock();
    this.controls = new THREE.OrbitControls(this.camera, this.settings.canvas);
    this.controls.update(this.clock.getDelta());
    this.controls.movementSpeed = 250;
    this.controls.domElement = this.renderer.domElement;
    this.controls.rollSpeed = Math.PI / 12;
    this.controls.autoForward = false;
    this.controls.dragToLook = true;
    
    var render = () => {
      requestAnimationFrame(render);
      this.graph.layout();
      this.controls.update(this.clock.getDelta());
      this.renderer.render(this.graph, this.camera);
    }
    
    render();
    
    return this;
  }
  
  resolve_click(event){
    if(event.target === this.renderer.domElement){
      var raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();
      mouse.x = ( event.clientX / this.renderer.domElement.width ) * 2 - 1;
      mouse.y = - ( event.clientY / this.renderer.domElement.height ) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      intersects = raycaster.intersectObjects(this.scene.children, true);

      if(intersects.length > 0){
        return intersects[0].object.vertex;
      }else{
        return null;
      }
    }
  }

}
