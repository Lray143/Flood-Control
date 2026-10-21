import sys
import os
import unittest

sys.path.insert(0, os.path.abspath('.'))
from src.server import get_scenarios, apply_scenario, ScenarioRequest, state, SCENARIO_PRESETS, MAIN_BLOCKAGE_PIPE_ID

class TestRainScenarios(unittest.TestCase):
    def test_get_scenarios_endpoint(self):
        data = get_scenarios()
        
        required_scenarios = ["light", "moderate", "heavy", "typhoon", "super_typhoon"]
        for sc in required_scenarios:
            self.assertIn(sc, data, f"Missing scenario preset: {sc}")
            self.assertIn("rainfall_mm_hr", data[sc])
            self.assertIn("duration_sim_hours", data[sc])
            self.assertIn("pipe_blockage_pct", data[sc])
            self.assertGreater(data[sc]["rainfall_mm_hr"], 0)

        # Check accurate values
        self.assertEqual(data["light"]["rainfall_mm_hr"], 2.5)
        self.assertEqual(data["moderate"]["rainfall_mm_hr"], 5.0)
        self.assertEqual(data["heavy"]["rainfall_mm_hr"], 30.0)
        self.assertEqual(data["typhoon"]["rainfall_mm_hr"], 55.0)
        self.assertEqual(data["super_typhoon"]["rainfall_mm_hr"], 100.0)

    def test_apply_light_scenario(self):
        resp = apply_scenario(ScenarioRequest(scenario_id="light"))
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["rainfall_mm_hr"], 2.5)
        self.assertEqual(resp["duration_sim_hours"], 24.0)
        self.assertEqual(resp["pipe_blockage_pct"], 20.0)
        
        # Check backend state
        expected_rate = 2.5 / 1000.0 / 3600.0
        self.assertAlmostEqual(state.rainfall_rate, expected_rate, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 0.20, places=2)

    def test_apply_moderate_scenario(self):
        resp = apply_scenario(ScenarioRequest(scenario_id="moderate"))
        self.assertEqual(resp["rainfall_mm_hr"], 5.0)
        self.assertAlmostEqual(state.rainfall_rate, 5.0 / 1000.0 / 3600.0, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 0.40, places=2)

    def test_apply_heavy_scenario(self):
        resp = apply_scenario(ScenarioRequest(scenario_id="heavy"))
        self.assertEqual(resp["rainfall_mm_hr"], 30.0)
        self.assertAlmostEqual(state.rainfall_rate, 30.0 / 1000.0 / 3600.0, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 0.65, places=2)

    def test_apply_typhoon_scenario(self):
        resp = apply_scenario(ScenarioRequest(scenario_id="typhoon"))
        self.assertEqual(resp["rainfall_mm_hr"], 55.0)
        self.assertAlmostEqual(state.rainfall_rate, 55.0 / 1000.0 / 3600.0, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 0.85, places=2)

    def test_apply_super_typhoon_scenario(self):
        resp = apply_scenario(ScenarioRequest(scenario_id="super_typhoon"))
        self.assertEqual(resp["rainfall_mm_hr"], 100.0)
        self.assertAlmostEqual(state.rainfall_rate, 100.0 / 1000.0 / 3600.0, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 1.0, places=2)

    def test_legacy_scenarios_backward_compatibility(self):
        # s1 -> heavy, s2 -> typhoon, s3 -> light
        resp1 = apply_scenario(ScenarioRequest(scenario_id="s1"))
        self.assertEqual(resp1["rainfall_mm_hr"], 30.0)

        resp2 = apply_scenario(ScenarioRequest(scenario_id="s2"))
        self.assertEqual(resp2["rainfall_mm_hr"], 55.0)

        resp3 = apply_scenario(ScenarioRequest(scenario_id="s3"))
        self.assertEqual(resp3["rainfall_mm_hr"], 2.5)

    def test_custom_scenario_parameters(self):
        # User passes explicit raw parameters
        resp = apply_scenario(ScenarioRequest(
            rainfall_mm_hr=75.0,
            duration_sim_hours=3.0,
            pipe_blockage_pct=50.0,
            reset_first=True
        ))
        self.assertEqual(resp["rainfall_mm_hr"], 75.0)
        self.assertEqual(resp["duration_sim_hours"], 3.0)
        self.assertEqual(resp["pipe_blockage_pct"], 50.0)
        self.assertAlmostEqual(state.rainfall_rate, 75.0 / 1000.0 / 3600.0, places=9)
        self.assertAlmostEqual(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage, 0.50, places=2)

class TestDrainageAndStability(unittest.TestCase):
    def test_water_drains_monotonically_to_zero(self):
        from src.server import simulator
        # Apply light rain briefly to deposit water
        apply_scenario(ScenarioRequest(scenario_id="light", reset_first=True))
        state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage = 0.0

        for _ in range(5):
            simulator.step(max_stable_dt=1.0)
        
        initial_vol = float(state.water_depth.sum()) * (state.dx ** 2)
        self.assertGreater(initial_vol, 0.0, "Should have water on surface after rain")

        # Rain stops
        state.rainfall_rate = 0.0
        vols = []
        for _ in range(60):
            simulator.step(max_stable_dt=1.0)
            vols.append(float(state.water_depth.sum()) * (state.dx ** 2))

        # Check strictly non-increasing during dry-down (no surcharge oscillation / ping-pong)
        diffs = [vols[i+1] - vols[i] for i in range(len(vols)-1)]
        increases = [d for d in diffs if d > 1e-4]
        self.assertEqual(len(increases), 0, f"Found {len(increases)} volume increases during dry-down!")

        # Final volume should be near zero or fully zero
        self.assertLess(vols[-1], 0.05, f"Residual volume was {vols[-1]}, expected < 0.05 m³")

    def test_cfl_stability_capped(self):
        import numpy as np
        from src.server import simulator
        # Apply heavy rain
        apply_scenario(ScenarioRequest(scenario_id="heavy", reset_first=True))
        
        # Run steps with capped max_dt=1.0
        for _ in range(15):
            simulator.step(max_stable_dt=1.0)
            self.assertFalse(np.isnan(state.water_depth).any(), "NaN detected in water depth!")
            self.assertTrue((state.water_depth >= 0.0).all(), "Negative depth detected!")
            self.assertLess(float(state.water_depth.max()), 5.0, "Unrealistic water height spike detected!")

if __name__ == '__main__':
    unittest.main()
