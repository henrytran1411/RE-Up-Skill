import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { EmployeeSkill } from '../types/skill';
import { SkillTrack } from '../types/common';

interface SkillRadarChartProps {
  employeeSkills: EmployeeSkill[];
}

export function SkillRadarChart({ employeeSkills }: SkillRadarChartProps) {
  const data = employeeSkills
    .filter((s) => s.track === SkillTrack.CURRENT)
    .map((s) => ({
      skill: s.skill.name,
      proficiency: s.proficiency,
    }));

  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>No current skills declared yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="skill" />
        <PolarRadiusAxis angle={30} domain={[0, 5]} />
        <Radar name="Proficiency" dataKey="proficiency" stroke="#1677ff" fill="#1677ff" fillOpacity={0.5} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
