/* Fixed-scale camera with an edge dead zone, delay and eased recentering. */
(function(root) {
  const defaults={viewRange:25,followLag:.75};
  class Camera {
    constructor(center=[0,0]) {this.reset(center);}
    reset(center) {this.center=center.slice(0,2);this.lastTime=null;this.edgeSince=null;this.following=false;}
    update(target,hx,hy,time,delay) {
      const elapsed=this.lastTime===null?0:Math.max(0,time-this.lastTime);
      if(this.lastTime!==null&&time<this.lastTime) {this.edgeSince=null;this.following=false;}
      this.lastTime=time;
      const distance=()=>Math.max(Math.abs(target[0]-this.center[0])/hx,Math.abs(target[1]-this.center[1])/hy);
      if(!this.following) {
        if(distance()>=.7) {
          if(this.edgeSince===null)this.edgeSince=time;
          if(time-this.edgeSince>=delay)this.following=true;
        } else this.edgeSince=null;
      }
      if(this.following) {
        const blend=1-Math.exp(-Math.min(.25,elapsed)/.75);
        this.center=this.center.map((v,j)=>v+(target[j]-v)*blend);
        if(distance()<.05){this.following=false;this.edgeSince=null;}
      }
      return this.center;
    }
  }
  root.PlotCamera={defaults,Camera};
  if(typeof module!=='undefined')module.exports=root.PlotCamera;
})(typeof window!=='undefined'?window:globalThis);
