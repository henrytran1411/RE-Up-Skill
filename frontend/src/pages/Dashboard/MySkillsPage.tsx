import { DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, Form, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, message } from 'antd';
import { useEffect, useState } from 'react';
import { SkillLevelTimeline } from '../../components/SkillLevelTimeline';
import { SkillPortfolioChart } from '../../components/SkillPortfolioChart';
import { SkillRadarChart } from '../../components/SkillRadarChart';
import { SkillStatusTag } from '../../components/SkillStatusTag';
import { SkillSuggestionsPanel } from '../../components/SkillSuggestionsPanel';
import { fetchAllSkillLevels } from '../../services/skillLevelService';
import {
  declareSkill,
  deleteEmployeeSkill,
  fetchAllSkills,
  fetchMySkillMatrix,
  updateEmployeeSkill,
} from '../../services/skillService';
import { fetchMySkillSuggestions } from '../../services/skillSuggestionService';
import { SkillStatus, SkillTrack } from '../../types/common';
import { EmployeeSkill, Skill } from '../../types/skill';
import { SkillLevel } from '../../types/skillLevel';
import { SkillGapSuggestion } from '../../types/skillSuggestion';

export function MySkillsPage() {
  const [employeeSkills, setEmployeeSkills] = useState<EmployeeSkill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [skillLevels, setSkillLevels] = useState<SkillLevel[]>([]);
  const [skillSuggestions, setSkillSuggestions] = useState<SkillGapSuggestion[]>([]);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeSkill | null>(null);
  const [timelineSkill, setTimelineSkill] = useState<Skill | null>(null);
  const [skillForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const selectedTrack = Form.useWatch('track', skillForm);

  const loadData = async () => {
    const [skills, catalog, levels, suggestions] = await Promise.all([
      fetchMySkillMatrix(),
      fetchAllSkills(),
      fetchAllSkillLevels(),
      fetchMySkillSuggestions(),
    ]);
    setEmployeeSkills(skills);
    setAllSkills(catalog);
    setSkillLevels(levels);
    setSkillSuggestions(suggestions);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeclareSkill = async () => {
    const values = await skillForm.validateFields();
    const [startDate, endDate] = values.dateRange;
    await declareSkill({
      skillId: values.skillId,
      track: values.track,
      proficiency: values.proficiency,
      progressPercent: values.progressPercent,
      level: values.track === SkillTrack.CURRENT ? values.level : undefined,
      startDate: startDate.format('YYYY-MM-DD'),
      endDate: endDate ? endDate.format('YYYY-MM-DD') : undefined,
    });
    message.success('Skill history created — pending review');
    setSkillModalOpen(false);
    skillForm.resetFields();
    loadData();
  };

  const handleEditSkill = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    await updateEmployeeSkill(editTarget.id, values);
    message.success('Skill history updated');
    setEditTarget(null);
    editForm.resetFields();
    loadData();
  };

  const handleDeleteSkill = async (id: string) => {
    await deleteEmployeeSkill(id);
    message.success('Skill history deleted');
    loadData();
  };

  return (
    <div>
      <Row gutter={[24, 24]}>

        <Col span={24}>
          <Card title="Suggested Learning">
            <SkillSuggestionsPanel suggestions={skillSuggestions} onAdded={loadData} />
          </Card>
        </Col>

        <Col span={24}>
          <Card title="My Skills Chart">
            <SkillPortfolioChart entries={employeeSkills} />
          </Card>
        </Col>

        <Col span={10}>
          <Card title="My Skill History">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={employeeSkills}
              columns={[
                { title: 'Skill', dataIndex: ['skill', 'name'] },
                { title: 'Track', dataIndex: 'track' },
                { title: 'Level', dataIndex: 'level', render: (level: string | null) => level ?? '—' },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (status: SkillStatus) => <SkillStatusTag status={status} />,
                },
                {
                  title: 'Period',
                  render: (_, record: EmployeeSkill) => `${record.startDate} → ${record.endDate ?? 'ongoing'}`,
                },
                {
                  title: '',
                  render: (_, record: EmployeeSkill) => (
                    <Space>
                      <Button
                        size="small"
                        icon={<HistoryOutlined />}
                        onClick={() => setTimelineSkill(record.skill)}
                      >
                        Timeline
                      </Button>
                      {(record.status === SkillStatus.START || record.status === SkillStatus.LEARNING) && (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditTarget(record);
                            editForm.setFieldsValue({
                              progressPercent: record.progressPercent ?? undefined,
                              proficiency: record.proficiency,
                              targetProficiency: record.targetProficiency ?? undefined,
                              level: record.level ?? undefined,
                            });
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {record.status === SkillStatus.START && (
                        <Popconfirm
                          title="Delete this skill history entry?"
                          onConfirm={() => handleDeleteSkill(record.id)}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
            {employeeSkills.length === 0 && <div style={{ color: '#999' }}>No skill history yet.</div>}
          </Card>
        </Col>
        
        <Col span={14}>
          <Card
            title="Skill Radar"
            extra={<Button icon={<PlusOutlined />} onClick={() => setSkillModalOpen(true)}>Declare skill</Button>}
          >
            <SkillRadarChart employeeSkills={employeeSkills} />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Declare a skill"
        open={skillModalOpen}
        onOk={handleDeclareSkill}
        onCancel={() => setSkillModalOpen(false)}
      >
        <Form form={skillForm} layout="vertical">
          <Form.Item name="skillId" label="Skill" rules={[{ required: true }]}>
            <Select
              options={allSkills.map((s) => ({ value: s.id, label: s.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="track" label="Track" rules={[{ required: true }]} initialValue={SkillTrack.CURRENT}>
            <Select
              options={[
                { value: SkillTrack.CURRENT, label: 'Current skill' },
                { value: SkillTrack.LEARNING, label: 'Learning' },
              ]}
            />
          </Form.Item>
          <Form.Item name="proficiency" label="Proficiency (1-5)" rules={[{ required: true }]}>
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          {selectedTrack === SkillTrack.CURRENT && (
            <Form.Item
              name="level"
              label="Level at this skill"
              rules={[{ required: true, message: 'Please select a level' }]}
            >
              <Select options={skillLevels.map((l) => ({ value: l.name, label: l.name }))} />
            </Form.Item>
          )}
          <Form.Item name="progressPercent" label="Progress % (learning only)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="dateRange"
            label="Study period"
            rules={[{ required: true, message: 'Please select a start date' }]}
          >
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              allowEmpty={[false, true]}
              placeholder={['Start date', 'End date (optional)']}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit skill history"
        open={editTarget !== null}
        onOk={handleEditSkill}
        onCancel={() => setEditTarget(null)}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="proficiency" label="Proficiency (1-5)">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="targetProficiency" label="Target proficiency (1-5)">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="progressPercent" label="Progress %">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          {editTarget?.track === SkillTrack.CURRENT && (
            <Form.Item name="level" label="Level at this skill">
              <Select options={skillLevels.map((l) => ({ value: l.name, label: l.name }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`${timelineSkill?.name ?? ''} timeline`}
        open={timelineSkill !== null}
        onCancel={() => setTimelineSkill(null)}
        footer={null}
      >
        <SkillLevelTimeline entries={employeeSkills.filter((s) => s.skillId === timelineSkill?.id)} />
      </Modal>
    </div>
  );
}
