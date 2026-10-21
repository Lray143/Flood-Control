import sys
import os
import unittest
import numpy as np

sys.path.insert(0, os.path.abspath('.'))
from src.engine.state import SimulationState
from src.engine.simulator import Simulator
from src.utils.city_builder import build_procedural_city

class TestPipeSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.city_data = build_procedural_city(nx=690, ny=380, dx=5.0)

    def _create_state(self):
        state = SimulationState(grid_shape=self.city_data['grid_shape'], dx=self.city_data['dx'])
        state.elevation = self.city_data['elevation'].copy()
        state.nodes = {nid: Node_copy for nid, Node_copy in self.city_data['nodes'].items()}
        # Deep clone nodes & pipes
        from src.engine.underground import Node, Pipe
        state.nodes = {
            nid: Node(n.id, n.x, n.y, n.z_invert, n.is_outlet, n.area)
            for nid, n in self.city_data['nodes'].items()
        }
        state.pipes = [
            Pipe(p.id, p.node_in, p.node_out, p.diameter, p.roughness_n, p.length)
            for p in self.city_data['pipes']
        ]
        state.inlet_mapping = self.city_data['inlet_mapping']
        state.road_mask = np.array(self.city_data['road_mask'], dtype=bool)
        state.roughness[state.road_mask] = 0.013
        state.roughness[~state.road_mask] = 0.040
        state.infiltration_rate[state.road_mask] = 0.0
        state.infiltration_rate[~state.road_mask] = 1.4e-6
        if self.city_data.get('border_mask') is not None:
            state.border_mask = np.array(self.city_data['border_mask'], dtype=bool)
        return state

    def test_pipe_flow_under_rain(self):
        state = self._create_state()
        state.rainfall_rate = 55.0 / 1000.0 / 3600.0  # 55 mm/hr typhoon
        sim = Simulator(state, dt=1.0)
        
        # Step 300 seconds
        for _ in range(300):
            sim.step(max_stable_dt=1.0)

        active_pipes = [p for p in state.pipes if abs(p.current_flow) > 1e-4]
        self.assertGreater(len(active_pipes), 10, "Multiple pipes should carry flow under rain")
        
        total_node_vol = sum(n.volume for n in state.nodes.values())
        self.assertGreater(total_node_vol, 5.0, "Underground nodes should store water")

    def test_blockage_throttles_flow(self):
        # Test Pipe with 0% vs 100% blockage
        state_clear = self._create_state()
        state_clear.pipes[0].blockage = 0.0
        state_clear.rainfall_rate = 55.0 / 1000.0 / 3600.0
        sim_clear = Simulator(state_clear, dt=1.0)
        for _ in range(300):
            sim_clear.step(max_stable_dt=1.0)
        flow_clear = state_clear.pipes[0].current_flow

        state_blocked = self._create_state()
        state_blocked.pipes[0].blockage = 1.0
        state_blocked.rainfall_rate = 55.0 / 1000.0 / 3600.0
        sim_blocked = Simulator(state_blocked, dt=1.0)
        for _ in range(300):
            sim_blocked.step(max_stable_dt=1.0)
        flow_blocked = state_blocked.pipes[0].current_flow

        self.assertEqual(flow_blocked, 0.0, "100% blocked pipe must have exactly 0 flow")
        if abs(flow_clear) > 1e-4:
            self.assertGreater(abs(flow_clear), abs(flow_blocked))

    def test_diameter_scaling(self):
        # Larger pipe diameter must yield higher hydraulic capacity
        from src.engine.underground import Pipe
        p_small = Pipe(1, 0, 1, diameter=0.6)
        p_large = Pipe(2, 0, 1, diameter=1.2)
        self.assertGreater(p_large.area, p_small.area)
        self.assertGreater(p_large.max_flow, p_small.max_flow)

if __name__ == '__main__':
    unittest.main()
