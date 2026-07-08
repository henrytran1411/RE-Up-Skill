import { useEffect, useState } from 'react';
import { Card, Select, Row, Col, Typography, Divider } from 'antd';
import { fetchAllEmployees, fetchEmployeeLevelHistory } from '../../services/employeeService';
import { fetchSkillHistory } from '../../services/skillService';
import { EmployeeLevelOverviewChart } from '../../components/EmployeeLevelOverviewChart';
import { LevelHistoryChart } from '../../components/LevelHistoryChart';
import { LevelHistoryTimeline } from '../../components/LevelHistoryTimeline';
import { SkillPortfolioChart } from '../../components/SkillPortfolioChart';
import { Employee, LevelHistoryEntry } from '../../types/employee';
import { EmployeeSkill } from '../../types/skill';

export function AnalyticsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historyByEmployeeId, setHistoryByEmployeeId] = useState<Map<string, LevelHistoryEntry[]>>(new Map());
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);
  const [selectedLevelHistory, setSelectedLevelHistory] = useState<LevelHistoryEntry[]>([]);
  const [selectedSkillHistory, setSelectedSkillHistory] = useState<EmployeeSkill[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setOverviewLoading(true);
      try {
        const allEmployees = await fetchAllEmployees();
        setEmployees(allEmployees);
        // One request per employee — fine at this org size; a bulk endpoint
        // would be worth adding if the roster grows into the hundreds.
        const histories = await Promise.all(
          allEmployees.map((employee) => fetchEmployeeLevelHistory(employee.id)),
        );
        setHistoryByEmployeeId(new Map(allEmployees.map((employee, i) => [employee.id, histories[i]])));
      } finally {
        setOverviewLoading(false);
      }
    })();
  }, []);

  const handleSelectEmployee = async (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setDetailLoading(true);
    try {
      const [levels, skills] = await Promise.all([
        fetchEmployeeLevelHistory(employeeId),
        fetchSkillHistory({ employeeId }),
      ]);
      setSelectedLevelHistory(levels);
      setSelectedSkillHistory(skills);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <Row gutter={[24, 24]}>
      <Col span={24}>
        <Card title="Level history — all employees" loading={overviewLoading}>
          <EmployeeLevelOverviewChart employees={employees} historyByEmployeeId={historyByEmployeeId} />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="Individual employee charts">
          <Select
            placeholder="Select an employee"
            style={{ width: 280, marginBottom: 16 }}
            showSearch
            optionFilterProp="label"
            options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
            value={selectedEmployeeId}
            onChange={handleSelectEmployee}
          />

          {selectedEmployee && !detailLoading && (
            <>
              <Typography.Title level={5}>Level history — {selectedEmployee.fullName}</Typography.Title>
              <LevelHistoryChart entries={selectedLevelHistory} />
              <LevelHistoryTimeline entries={selectedLevelHistory} />

              <Divider />

              <Typography.Title level={5}>Skill portfolio — {selectedEmployee.fullName}</Typography.Title>
              <SkillPortfolioChart entries={selectedSkillHistory} />
            </>
          )}
          {detailLoading && 'Loading…'}
        </Card>
      </Col>
    </Row>
  );
}
